import pymupdf
from typing import List, Dict, Any
from langchain_text_splitters import RecursiveCharacterTextSplitter
from ..database import SessionLocal, Document, DocStatus, get_vector_collection
import uuid
import logging
import asyncio

logger = logging.getLogger(__name__)


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
        """Extracts text from a PDF file using PyMuPDF.

        Raises:
            ValueError: If PDF is corrupt, password-protected, or has no extractable text.
        """
        try:
            doc = pymupdf.open(file_path)
        except Exception as e:
            raise ValueError(f"Failed to open PDF file: {str(e)}")

        # Check if PDF is encrypted/password-protected
        if doc.is_encrypted:
            doc.close()
            raise ValueError("PDF is password-protected and cannot be processed")

        text = ""
        try:
            for page in doc:
                text += page.get_text()
        finally:
            doc.close()

        if not text or not text.strip():
            raise ValueError("PDF contains no extractable text (may be scanned images)")

        return text

    async def process_and_index(self, doc_id: int, file_path: str):
        """Processes a PDF: Parse -> Chunk -> Embed -> Store."""
        db = SessionLocal()
        try:
            # 1. Update status to PARSING
            doc = db.query(Document).filter(Document.id == doc_id).first()
            if not doc:
                logger.warning(f"Document {doc_id} not found")
                return

            doc.status = DocStatus.PARSING
            doc.progress = 20
            db.commit()

            # 2. Extract text (run blocking I/O in thread pool)
            try:
                text = await asyncio.get_event_loop().run_in_executor(
                    None, self.extract_text, file_path
                )
            except ValueError as e:
                logger.error(f"PDF extraction error for doc {doc_id}: {str(e)}")
                doc.status = DocStatus.FAILED
                db.commit()
                return

            # 3. Chunk text
            doc.status = DocStatus.EMBEDDING
            doc.progress = 50
            db.commit()

            chunks = self.text_splitter.split_text(text)

            if not chunks:
                logger.warning(f"No text chunks generated for doc {doc_id}")
                doc.status = DocStatus.FAILED
                db.commit()
                return

            # 4. Index in ChromaDB
            collection = get_vector_collection()

            # We use a batch size for embedding to avoid overloading
            batch_size = 100
            total_chunks = len(chunks)

            for i in range(0, total_chunks, batch_size):
                batch = chunks[i:i+batch_size]
                ids = [str(uuid.uuid4()) for _ in batch]
                metadatas = [{"session_id": self.session_id, "document_id": doc_id} for _ in batch]

                collection.add(
                    documents=batch,
                    metadatas=metadatas,
                    ids=ids
                )

                # Update progress - avoid division by zero
                progress = 50 + int((i / total_chunks) * 50)
                doc.progress = min(progress, 99)
                db.commit()

            # 5. Finalize
            doc.status = DocStatus.COMPLETED
            doc.progress = 100
            db.commit()
            logger.info(f"Successfully processed PDF doc {doc_id} with {total_chunks} chunks")

        except Exception as e:
            logger.error(f"Error processing PDF {doc_id}: {str(e)}", exc_info=True)
            try:
                doc = db.query(Document).filter(Document.id == doc_id).first()
                if doc:
                    doc.status = DocStatus.FAILED
                    db.commit()
            except Exception:
                db.rollback()
        finally:
            db.close()
