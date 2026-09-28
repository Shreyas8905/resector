import pymupdf
from typing import List, Dict, Any
from langchain_text_splitters import RecursiveCharacterTextSplitter
from ..database import SessionLocal, Document, DocStatus, get_vector_collection
import uuid

class PDFProcessor:
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000,
            chunk_overlap=200,
            length_function=len,
            is_separator_regex=False,
        )

    def extract_text(self, file_path: str) -> str:
        """Extracts text from a PDF file using PyMuPDF."""
        doc = pymupdf.open(file_path)
        text = ""
        for page in doc:
            text += page.get_text()
        doc.close()
        return text

    async def process_and_index(self, doc_id: int, file_path: str):
        """Processes a PDF: Parse -> Chunk -> Embed -> Store."""
        db = SessionLocal()
        try:
            # 1. Update status to PARSING
            doc = db.query(Document).filter(Document.id == doc_id).first()
            if not doc:
                return

            doc.status = DocStatus.PARSING
            doc.progress = 20
            db.commit()

            # 2. Extract text
            text = self.extract_text(file_path)

            # 3. Chunk text
            doc.status = DocStatus.EMBEDDING
            doc.progress = 50
            db.commit()

            chunks = self.text_splitter.split_text(text)

            # 4. Index in ChromaDB
            collection = get_vector_collection()

            # We use a batch size for embedding to avoid overloading
            batch_size = 100
            for i in range(0, len(chunks), batch_size):
                batch = chunks[i:i+batch_size]
                ids = [str(uuid.uuid4()) for _ in batch]
                metadatas = [{"session_id": self.session_id, "document_id": doc_id} for _ in batch]

                collection.add(
                    documents=batch,
                    metadatas=metadatas,
                    ids=ids
                )

                # Update progress
                progress = 50 + int((i / len(chunks)) * 50)
                doc.progress = min(progress, 99)
                db.commit()

            # 5. Finalize
            doc.status = DocStatus.COMPLETED
            doc.progress = 100
            db.commit()

        except Exception as e:
            print(f"Error processing PDF {doc_id}: {str(e)}")
            doc = db.query(Document).filter(Document.id == doc_id).first()
            if doc:
                doc.status = DocStatus.FAILED
                db.commit()
        finally:
            db.close()
