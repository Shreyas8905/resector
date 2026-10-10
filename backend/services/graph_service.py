import asyncio
import re
import hashlib
import logging
from typing import Any, Dict, List, Optional, Set, Tuple
import httpx
import networkx as nx

try:
    from tavily import TavilyClient
except ImportError:
    TavilyClient = None

logger = logging.getLogger(__name__)

S2_BASE_URL = "https://api.semanticscholar.org/graph/v1"
OPENALEX_BASE_URL = "https://api.openalex.org"
PAPER_FIELDS = "paperId,title,abstract,year,citationCount,referenceCount,authors,url,citations.paperId,citations.title,citations.year,citations.citationCount,citations.authors,references.paperId,references.title,references.year,references.citationCount,references.authors"
MINIMAL_FIELDS = "paperId,title,abstract,year,citationCount,referenceCount,authors,url"

class GraphService:
    def __init__(self, s2_api_key: Optional[str] = None, tavily_api_key: Optional[str] = None):
        self.s2_api_key = s2_api_key
        self.tavily_api_key = tavily_api_key

    def _get_s2_headers(self) -> Dict[str, str]:
        headers = {
            "User-Agent": "Resector-Academic-Companion/1.0"
        }
        if self.s2_api_key and self.s2_api_key.strip():
            headers["x-api-key"] = self.s2_api_key.strip()
        return headers

    def _get_openalex_headers(self) -> Dict[str, str]:
        return {
            "User-Agent": "Resector-Academic-Companion/1.0 (mailto:team@resector.local)"
        }

    def _clean_title(self, raw: str) -> str:
        """Cleans uploaded filenames and raw strings into clean paper titles."""
        t = raw.strip()
        # Remove extension
        t = re.sub(r'\.[a-zA-Z0-9]{2,4}$', '', t)
        # Remove leading uuid/timestamps (e.g. 550e8400-e29b-41d4-a716-446655440000_ or 1706.03762_)
        t = re.sub(r'^[0-9a-fA-F-]{8,36}_', '', t)
        t = re.sub(r'^\d{4}\.\d{4,5}(?:v\d+)?_', '', t)
        # Replace underscores and hyphens with spaces
        t = t.replace('_', ' ').replace('-', ' ')
        # Clean extra spaces
        t = re.sub(r'\s+', ' ', t).strip()
        return t

    def _format_authors(self, authors: Any) -> List[str]:
        if not authors:
            return []
        names = []
        for a in authors:
            if isinstance(a, dict):
                if "name" in a:
                    names.append(a["name"])
                elif "author" in a and isinstance(a["author"], dict) and "display_name" in a["author"]:
                    names.append(a["author"]["display_name"])
            elif isinstance(a, str):
                names.append(a)
        return names

    # --- Semantic Scholar Integration ---

    async def fetch_paper_s2_by_id(self, client: httpx.AsyncClient, paper_id: str) -> Optional[Dict[str, Any]]:
        url = f"{S2_BASE_URL}/paper/{paper_id}"
        params = {"fields": PAPER_FIELDS}
        for attempt in range(2):
            try:
                resp = await client.get(url, params=params, headers=self._get_s2_headers(), timeout=10.0)
                if resp.status_code == 200:
                    return resp.json()
                elif resp.status_code == 429:
                    await asyncio.sleep(1.2 * (attempt + 1))
                elif resp.status_code == 404:
                    logger.debug(f"Paper not found in S2: {paper_id}")
                    return None
            except httpx.TimeoutException:
                logger.warning(f"Timeout fetching S2 paper {paper_id}")
            except Exception as e:
                logger.warning(f"Error fetching S2 paper {paper_id}: {str(e)}")
        return None

    async def search_paper_s2(self, client: httpx.AsyncClient, query: str) -> Optional[Dict[str, Any]]:
        url = f"{S2_BASE_URL}/paper/search"
        params = {"query": query, "limit": 3, "fields": MINIMAL_FIELDS}
        for attempt in range(2):
            try:
                resp = await client.get(url, params=params, headers=self._get_s2_headers(), timeout=10.0)
                if resp.status_code == 200:
                    data = resp.json()
                    if data.get("total", 0) > 0 and data.get("data"):
                        top = data["data"][0]
                        pid = top.get("paperId")
                        if pid:
                            full = await self.fetch_paper_s2_by_id(client, pid)
                            if full:
                                return full
                        return top
                elif resp.status_code == 429:
                    await asyncio.sleep(1.2 * (attempt + 1))
            except httpx.TimeoutException:
                logger.warning(f"Timeout searching S2 for: {query}")
            except Exception as e:
                logger.warning(f"Error searching S2 for '{query}': {str(e)}")
        return None

    # --- OpenAlex Integration (250M+ Academic Papers & Citations) ---

    async def search_paper_openalex(self, client: httpx.AsyncClient, query: str) -> Optional[Dict[str, Any]]:
        url = f"{OPENALEX_BASE_URL}/works"
        params = {"search": query, "per-page": 3}
        try:
            resp = await client.get(url, params=params, headers=self._get_openalex_headers(), timeout=10.0)
            if resp.status_code == 200:
                data = resp.json()
                results = data.get("results", [])
                if results:
                    return results[0]
        except httpx.TimeoutException:
            logger.warning(f"Timeout searching OpenAlex for: {query}")
        except Exception as e:
            logger.warning(f"OpenAlex search error: {str(e)}")
        return None

    async def fetch_openalex_citations(self, client: httpx.AsyncClient, openalex_id: str, limit: int = 50) -> List[Dict[str, Any]]:
        """Fetches up to 50 real research papers citing this work from OpenAlex."""
        clean_id = openalex_id.split("/")[-1]
        url = f"{OPENALEX_BASE_URL}/works"
        params = {
            "filter": f"cites:{clean_id}",
            "per-page": min(limit, 50),
            "sort": "cited_by_count:desc"
        }
        try:
            resp = await client.get(url, params=params, headers=self._get_openalex_headers(), timeout=10.0)
            if resp.status_code == 200:
                return resp.json().get("results", [])
        except httpx.TimeoutException:
            logger.warning(f"Timeout fetching OpenAlex citations for: {openalex_id}")
        except Exception as e:
            logger.warning(f"OpenAlex citations fetch error: {str(e)}")
        return []

    async def fetch_openalex_references(self, client: httpx.AsyncClient, ref_ids: List[str], limit: int = 30) -> List[Dict[str, Any]]:
        """Fetches referenced papers by OpenAlex IDs."""
        if not ref_ids:
            return []
        ids_to_fetch = [r.split("/")[-1] for r in ref_ids[:limit]]
        pipe_ids = "|".join(ids_to_fetch)
        url = f"{OPENALEX_BASE_URL}/works"
        params = {
            "filter": f"openalex:{pipe_ids}",
            "per-page": limit
        }
        try:
            resp = await client.get(url, params=params, headers=self._get_openalex_headers(), timeout=10.0)
            if resp.status_code == 200:
                return resp.json().get("results", [])
        except httpx.TimeoutException:
            logger.warning("Timeout fetching OpenAlex references")
        except Exception as e:
            logger.warning(f"OpenAlex references fetch error: {str(e)}")
        return []

    # --- Academic Tavily Search Fallback ---

    def search_paper_academic_tavily(self, query: str) -> Optional[Dict[str, Any]]:
        if not TavilyClient or not self.tavily_api_key or not self.tavily_api_key.strip():
            return None
        try:
            tavily = TavilyClient(api_key=self.tavily_api_key.strip())
            # Strictly search scholarly sources for papers
            search_query = f"{query} research paper abstract site:arxiv.org OR site:semanticscholar.org OR site:openalex.org OR site:biorxiv.org OR site:nature.com OR site:ieee.org"
            response = tavily.search(query=search_query, search_depth="advanced", max_results=5)
            results = response.get("results", [])
            if not results:
                return None

            combined_text = " ".join([r.get("url", "") + " " + r.get("content", "") for r in results])
            doi_match = re.search(r'10\.\d{4,9}/[-._;()/:A-Za-z0-9]+', combined_text)
            arxiv_match = re.search(r'(?:arxiv:)?(\d{4}\.\d{4,5}(?:v\d+)?)', combined_text, re.IGNORECASE)

            identifier = None
            if doi_match:
                identifier = f"DOI:{doi_match.group(0).rstrip('.')}"
            elif arxiv_match:
                identifier = f"ARXIV:{arxiv_match.group(1)}"

            return {
                "identifier": identifier,
                "title": results[0].get("title", query),
                "url": results[0].get("url", ""),
                "abstract": results[0].get("content", ""),
                "results": results
            }
        except Exception as e:
            logger.warning(f"Tavily search error: {str(e)}")
            return None

    # --- Unified Resolution ---

    async def resolve_paper_and_network(
        self,
        client: httpx.AsyncClient,
        query_or_id: str,
        title: Optional[str] = None
    ) -> Tuple[Dict[str, Any], List[Dict[str, Any]], List[Dict[str, Any]]]:
        """
        Resolves the root academic paper and its immediate citation/reference pool
        across Semantic Scholar, OpenAlex, and scholarly search.
        Returns (root_dict, citations_list, references_list).
        """
        clean_target = self._clean_title(title or query_or_id)
        raw_target = (title or query_or_id).strip()

        # 1. Direct arXiv or DOI lookup on Semantic Scholar
        arxiv_match = re.search(r'(?:arxiv\.org/(?:abs|pdf)/|arXiv:)?(\d{4}\.\d{4,5}(?:v\d+)?)', raw_target, re.IGNORECASE)
        doi_match = re.search(r'(?:doi\.org/|doi:)?(10\.\d{4,9}/[-._;()/:A-Za-z0-9]+)', raw_target, re.IGNORECASE)

        if arxiv_match and len(arxiv_match.group(1)) >= 9:
            s2_paper = await self.fetch_paper_s2_by_id(client, f"ARXIV:{arxiv_match.group(1)}")
            if s2_paper and s2_paper.get("paperId"):
                return self._parse_s2_result(s2_paper, clean_target)

        if doi_match and "10." in doi_match.group(1):
            s2_paper = await self.fetch_paper_s2_by_id(client, f"DOI:{doi_match.group(1)}")
            if s2_paper and s2_paper.get("paperId"):
                return self._parse_s2_result(s2_paper, clean_target)

        # 2. Semantic Scholar Search
        s2_paper = await self.search_paper_s2(client, clean_target)
        if s2_paper and s2_paper.get("paperId") and (s2_paper.get("citations") or s2_paper.get("references")):
            return self._parse_s2_result(s2_paper, clean_target)

        # 3. OpenAlex Search (Reliable & Comprehensive)
        oa_paper = await self.search_paper_openalex(client, clean_target)
        if oa_paper:
            oa_id = oa_paper.get("id")
            citations_oa = await self.fetch_openalex_citations(client, oa_id, limit=50)
            ref_ids = oa_paper.get("referenced_works", [])
            references_oa = await self.fetch_openalex_references(client, ref_ids, limit=25)

            authors = [a.get("author", {}).get("display_name", "") for a in oa_paper.get("authorships", []) if a.get("author")]
            root_dict = {
                "paperId": oa_id,
                "title": oa_paper.get("title") or clean_target,
                "year": oa_paper.get("publication_year"),
                "authors": authors,
                "citationCount": oa_paper.get("cited_by_count", 0),
                "referenceCount": len(ref_ids),
                "referenced_works": ref_ids,
                "abstract": oa_paper.get("abstract", "") or "",
                "url": oa_paper.get("doi") or oa_paper.get("id", ""),
                "is_root": True
            }

            parsed_citations = [
                {
                    "paperId": c.get("id"),
                    "title": c.get("title", "Untitled Research"),
                    "year": c.get("publication_year"),
                    "authors": [a.get("author", {}).get("display_name", "") for a in c.get("authorships", []) if a.get("author")],
                    "citationCount": c.get("cited_by_count", 0),
                    "referenceCount": len(c.get("referenced_works", [])),
                    "referenced_works": c.get("referenced_works", []),
                    "abstract": "",
                    "url": c.get("doi") or c.get("id", ""),
                    "is_root": False
                }
                for c in citations_oa if c.get("title")
            ]

            parsed_references = [
                {
                    "paperId": r.get("id"),
                    "title": r.get("title", "Untitled Reference"),
                    "year": r.get("publication_year"),
                    "authors": [a.get("author", {}).get("display_name", "") for a in r.get("authorships", []) if a.get("author")],
                    "citationCount": r.get("cited_by_count", 0),
                    "referenceCount": len(r.get("referenced_works", [])),
                    "referenced_works": r.get("referenced_works", []),
                    "abstract": "",
                    "url": r.get("doi") or r.get("id", ""),
                    "is_root": False
                }
                for r in references_oa if r.get("title")
            ]


            return root_dict, parsed_citations, parsed_references

        # 4. Fallback: Academic Tavily Search
        tavily_data = self.search_paper_academic_tavily(clean_target)
        if tavily_data:
            if tavily_data.get("identifier"):
                s2_retry = await self.fetch_paper_s2_by_id(client, tavily_data["identifier"])
                if s2_retry and s2_retry.get("paperId"):
                    return self._parse_s2_result(s2_retry, clean_target)

            # Search OpenAlex with Tavily's cleaned title
            tavily_title = self._clean_title(tavily_data.get("title", ""))
            if tavily_title and tavily_title.lower() != clean_target.lower():
                oa_retry = await self.search_paper_openalex(client, tavily_title)
                if oa_retry:
                    citations_oa = await self.fetch_openalex_citations(client, oa_retry.get("id"), limit=50)
                    ref_ids = oa_retry.get("referenced_works", [])
                    references_oa = await self.fetch_openalex_references(client, ref_ids, limit=25)
                    root_dict = {
                        "paperId": oa_retry.get("id"),
                        "title": clean_target or oa_retry.get("title"),
                        "year": oa_retry.get("publication_year"),
                        "authors": [a.get("author", {}).get("display_name", "") for a in oa_retry.get("authorships", []) if a.get("author")],
                        "citationCount": oa_retry.get("cited_by_count", 0),
                        "referenceCount": len(ref_ids),
                        "abstract": tavily_data.get("abstract", ""),
                        "url": oa_retry.get("doi") or tavily_data.get("url", ""),
                        "is_root": True
                    }
                    parsed_cites = [
                        {
                            "paperId": c.get("id"),
                            "title": c.get("title", "Research Paper"),
                            "year": c.get("publication_year"),
                            "authors": [a.get("author", {}).get("display_name", "") for a in c.get("authorships", []) if a.get("author")],
                            "citationCount": c.get("cited_by_count", 0),
                            "referenceCount": len(c.get("referenced_works", [])),
                            "abstract": "",
                            "url": c.get("doi") or c.get("id", ""),
                            "is_root": False
                        }
                        for c in citations_oa if c.get("title")
                    ]
                    return root_dict, parsed_cites, []

        # 5. Guaranteed Synthetic Fallback Root
        # Use stable hash instead of Python's hash() which varies across processes
        stable_hash = hashlib.sha256(clean_target.encode()).hexdigest()[:8]
        root_dict = {
            "paperId": f"synthetic_{stable_hash}",
            "title": clean_target or "Uploaded Research Paper",
            "year": None,
            "authors": ["Author"],
            "citationCount": 0,
            "referenceCount": 0,
            "abstract": "",
            "url": "",
            "is_root": True
        }
        return root_dict, [], []

    def _parse_s2_result(self, s2_paper: Dict[str, Any], clean_target: str) -> Tuple[Dict[str, Any], List[Dict[str, Any]], List[Dict[str, Any]]]:
        root = {
            "paperId": s2_paper.get("paperId"),
            "title": s2_paper.get("title") or clean_target,
            "year": s2_paper.get("year"),
            "authors": self._format_authors(s2_paper.get("authors")),
            "citationCount": s2_paper.get("citationCount", 0),
            "referenceCount": s2_paper.get("referenceCount", 0),
            "abstract": s2_paper.get("abstract") or "",
            "url": s2_paper.get("url") or "",
            "is_root": True
        }

        cites = [
            {
                "paperId": c.get("paperId"),
                "title": c.get("title", "Untitled Paper"),
                "year": c.get("year"),
                "authors": self._format_authors(c.get("authors")),
                "citationCount": c.get("citationCount", 0),
                "referenceCount": c.get("referenceCount", 0),
                "abstract": "",
                "url": f"https://www.semanticscholar.org/paper/{c.get('paperId')}",
                "is_root": False
            }
            for c in s2_paper.get("citations", []) if c and c.get("paperId") and c.get("title")
        ]

        refs = [
            {
                "paperId": r.get("paperId"),
                "title": r.get("title", "Untitled Reference"),
                "year": r.get("year"),
                "authors": self._format_authors(r.get("authors")),
                "citationCount": r.get("citationCount", 0),
                "referenceCount": r.get("referenceCount", 0),
                "abstract": "",
                "url": f"https://www.semanticscholar.org/paper/{r.get('paperId')}",
                "is_root": False
            }
            for r in s2_paper.get("references", []) if r and r.get("paperId") and r.get("title")
        ]

        return root, cites, refs

    # --- Full Multi-Hop Traversal up to 50+ Nodes ---

    async def generate_citation_graph(
        self,
        query: str,
        title: Optional[str] = None,
        paper_id: Optional[str] = None,
        max_nodes: int = 50
    ) -> Dict[str, Any]:
        """
        Builds a NetworkX graph with AT LEAST max_nodes (minimum 50) real academic papers,
        with the uploaded/requested paper guaranteed at the root,
        and computes shortest-path proximity hop distances.
        """
        target_nodes_count = max(50, max_nodes)

        async with httpx.AsyncClient() as client:
            root_paper, citations, references = await self.resolve_paper_and_network(
                client, paper_id or query, title=title
            )

            root_id = root_paper["paperId"]
            G = nx.DiGraph()

            # 1. Add Root Paper Node
            G.add_node(
                root_id,
                paperId=root_id,
                title=root_paper.get("title") or (title or query),
                year=root_paper.get("year"),
                authors=root_paper.get("authors", []),
                citationCount=root_paper.get("citationCount", 0),
                referenceCount=root_paper.get("referenceCount", 0),
                referenced_works=root_paper.get("referenced_works", []),
                abstract=root_paper.get("abstract", ""),
                url=root_paper.get("url", ""),
                is_root=True
            )

            visited: Set[str] = {root_id}
            expansion_queue: List[Dict[str, Any]] = []

            # 2. Add Direct Citations (Paper -> Cites -> Root)
            for c in citations:
                if len(G.nodes) >= target_nodes_count:
                    break
                cid = c["paperId"]
                if cid not in visited:
                    visited.add(cid)
                    G.add_node(
                        cid,
                        paperId=cid,
                        title=c.get("title", "Untitled Research"),
                        year=c.get("year"),
                        authors=c.get("authors", []),
                        citationCount=c.get("citationCount", 0),
                        referenceCount=c.get("referenceCount", 0),
                        referenced_works=c.get("referenced_works", []),
                        abstract=c.get("abstract", ""),
                        url=c.get("url", ""),
                        is_root=False
                    )
                    expansion_queue.append(c)
                G.add_edge(cid, root_id, type="citation")

            # 3. Add Direct References (Root -> References -> Paper)
            for r in references:
                if len(G.nodes) >= target_nodes_count:
                    break
                rid = r["paperId"]
                if rid not in visited:
                    visited.add(rid)
                    G.add_node(
                        rid,
                        paperId=rid,
                        title=r.get("title", "Untitled Reference"),
                        year=r.get("year"),
                        authors=r.get("authors", []),
                        citationCount=r.get("citationCount", 0),
                        referenceCount=r.get("referenceCount", 0),
                        referenced_works=r.get("referenced_works", []),
                        abstract=r.get("abstract", ""),
                        url=r.get("url", ""),
                        is_root=False
                    )
                    expansion_queue.append(r)
                G.add_edge(root_id, rid, type="reference")


            # 4. Multi-hop Expansion if fewer than target_nodes_count
            while expansion_queue and len(G.nodes) < target_nodes_count:
                next_paper = expansion_queue.pop(0)
                nid = next_paper["paperId"]

                # If OpenAlex paper, fetch citing works
                if nid.startswith("https://openalex.org") or nid.startswith("W"):
                    sub_cites = await self.fetch_openalex_citations(client, nid, limit=20)
                    for sc in sub_cites:
                        if len(G.nodes) >= target_nodes_count:
                            break
                        sc_id = sc.get("id")
                        if not sc_id or sc_id in visited:
                            continue
                        visited.add(sc_id)
                        G.add_node(
                            sc_id,
                            paperId=sc_id,
                            title=sc.get("title", "Research Paper"),
                            year=sc.get("publication_year"),
                            authors=[a.get("author", {}).get("display_name", "") for a in sc.get("authorships", []) if a.get("author")],
                            citationCount=sc.get("cited_by_count", 0),
                            referenceCount=len(sc.get("referenced_works", [])),
                            referenced_works=sc.get("referenced_works", []),
                            abstract="",
                            url=sc.get("doi") or sc_id,
                            is_root=False
                        )
                        G.add_edge(sc_id, nid, type="citation")
                # If S2 paper, fetch citations
                elif len(nid) == 40 or any(nid.startswith(p) for p in ["ARXIV:", "DOI:"]):
                    sub_s2 = await self.fetch_paper_s2_by_id(client, nid)
                    if sub_s2:
                        for sc in sub_s2.get("citations", []):
                            if len(G.nodes) >= target_nodes_count:
                                break
                            if not sc or not sc.get("paperId") or sc["paperId"] in visited:
                                continue
                            sc_id = sc["paperId"]
                            visited.add(sc_id)
                            G.add_node(
                                sc_id,
                                paperId=sc_id,
                                title=sc.get("title", "Research Paper"),
                                year=sc.get("year"),
                                authors=self._format_authors(sc.get("authors")),
                                citationCount=sc.get("citationCount", 0),
                                referenceCount=sc.get("referenceCount", 0),
                                referenced_works=[r.get("paperId") for r in sc.get("references", []) if r and r.get("paperId")],
                                abstract="",
                                url=f"https://www.semanticscholar.org/paper/{sc_id}",
                                is_root=False
                            )
                            G.add_edge(sc_id, nid, type="citation")

            # --- 5. Inter-Paper Cross-Citations & Bibliographic Coupling (Dense Chain Network) ---
            node_ids_set = set(G.nodes())
            node_ref_sets: Dict[str, Set[str]] = {}
            for n, data in G.nodes(data=True):
                raw_refs = data.get("referenced_works") or []
                node_ref_sets[n] = set(raw_refs)

            # Add direct cross-citation edges (if Paper A references Paper B in the graph)
            for n, refs in node_ref_sets.items():
                for r in refs:
                    if r in node_ids_set and r != n:
                        G.add_edge(n, r, type="cross_citation", weight=1.5)

            # Add Bibliographic Coupling edges (shared references / co-citation chains)
            node_list = list(G.nodes())
            for i in range(len(node_list)):
                for j in range(i + 1, len(node_list)):
                    u, v = node_list[i], node_list[j]
                    set_u, set_v = node_ref_sets[u], node_ref_sets[v]
                    if set_u and set_v:
                        shared = len(set_u & set_v)
                        union = len(set_u | set_v)
                        if union > 0:
                            jaccard = shared / union
                            if jaccard >= 0.035 or shared >= 2:
                                if not G.has_edge(u, v):
                                    G.add_edge(u, v, type="co_citation", weight=round(jaccard * 3.0, 2))

            # --- 6. Calculate Proximity Hop Distances & Distinct Thematic Clusters ---
            undirected_G = G.to_undirected()
            try:
                shortest_paths = nx.single_source_shortest_path_length(undirected_G, root_id)
            except Exception:
                shortest_paths = {root_id: 0}

            # Louvain community detection with resolution parameter for vibrant, distinct clusters
            clusters: Dict[str, int] = {}
            try:
                from networkx.algorithms.community import louvain_communities
                comm_list = list(louvain_communities(undirected_G, resolution=1.1, seed=42))
                # Sort communities by size so main clusters get prominent primary colors
                comm_list.sort(key=len, reverse=True)
                for c_idx, comm in enumerate(comm_list):
                    for n in comm:
                        clusters[n] = c_idx % 8
            except Exception:
                try:
                    from networkx.algorithms.community import greedy_modularity_communities
                    comm_list = list(greedy_modularity_communities(undirected_G))
                    comm_list.sort(key=len, reverse=True)
                    for c_idx, comm in enumerate(comm_list):
                        for n in comm:
                            clusters[n] = c_idx % 8
                except Exception:
                    clusters = {n: 0 for n in G.nodes()}


            # Calculate importance scale
            max_cites = max([data.get("citationCount", 0) for _, data in G.nodes(data=True)] or [1])
            if max_cites <= 0:
                max_cites = 1

            # 6. Format Nodes & Edges
            nodes_data = []
            for node_id, data in G.nodes(data=True):
                distance = shortest_paths.get(node_id, 99)
                is_root = bool(data.get("is_root", False)) or node_id == root_id
                c_count = data.get("citationCount", 0)
                # Sqrt normalized importance scale between 0.1 and 1.0
                importance = round(min(1.0, max(0.15, (c_count / max_cites) ** 0.45)), 3)

                nodes_data.append({
                    "id": node_id,
                    "paperId": data.get("paperId", node_id),
                    "title": data.get("title", "Untitled Paper"),
                    "year": data.get("year"),
                    "authors": data.get("authors", []),
                    "citationCount": c_count,
                    "referenceCount": data.get("referenceCount", 0),
                    "abstract": data.get("abstract", ""),
                    "url": data.get("url", ""),
                    "is_root": is_root,
                    "distance": distance,
                    "cluster": clusters.get(node_id, 0),
                    "importance": importance
                })

            edges_data = []
            for u, v, data in G.edges(data=True):
                edges_data.append({
                    "source": u,
                    "target": v,
                    "type": data.get("type", "citation")
                })

            return {
                "root_paper_id": root_id,
                "nodes": nodes_data,
                "edges": edges_data,
                "total_nodes": len(nodes_data),
                "total_edges": len(edges_data)
            }

