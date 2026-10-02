import io
from fastapi import APIRouter, File, UploadFile, HTTPException
from docx import Document
from striprtf.striprtf import rtf_to_text

router = APIRouter(prefix="/v1/parse", tags=["parse"])

@router.post("/docx")
async def parse_docx_endpoint(file: UploadFile = File(...)):
    file_bytes = await file.read()
    print(f"[Routing: Parse] Endpoint: /docx | Bytes: {len(file_bytes)}")
    try:
        doc = Document(io.BytesIO(file_bytes))
        title = doc.core_properties.title or ""
        author = doc.core_properties.author or "Unknown Author"
        
        blocks = []
        for element in doc.element.body:
            if element.tag.endswith('p'):
                # it's a paragraph
                for p in doc.paragraphs:
                    if p._p == element:
                        text = p.text.strip()
                        if not text:
                            break
                        style_name = p.style.name if p.style else ""
                        if style_name.startswith("Heading"):
                            try:
                                level = int(style_name.replace("Heading", "").strip())
                                blocks.append({"kind": "heading", "level": level, "text": text})
                            except:
                                blocks.append({"kind": "paragraph", "text": text})
                        else:
                            blocks.append({"kind": "paragraph", "text": text})
                        break
            elif element.tag.endswith('tbl'):
                # it's a table
                for t in doc.tables:
                    if t._tbl == element:
                        rows = []
                        for row in t.rows:
                            rows.append([cell.text.strip() for cell in row.cells])
                        blocks.append({"kind": "table", "rows": rows})
                        break
        
        if not title:
            for b in blocks:
                if b["kind"] == "heading":
                    title = b["text"]
                    break

        return {"title": title, "author": author, "blocks": blocks}
    except Exception as e:
        raise HTTPException(status_code=400, detail={"status": "error", "code": "INVALID_DOCX", "message": str(e)})

@router.post("/rtf")
async def parse_rtf_endpoint(file: UploadFile = File(...)):
    file_bytes = await file.read()
    print(f"[Routing: Parse] Endpoint: /rtf | Bytes: {len(file_bytes)}")
    try:
        text = rtf_to_text(file_bytes.decode('utf-8', errors='replace'))
        paragraphs = [p.strip() for p in text.split('\n\n') if p.strip()]
        
        blocks = [{"kind": "paragraph", "text": p} for p in paragraphs]
        
        title = ""
        author = "Unknown Author"
        
        # Super basic info extraction
        import re
        info_match = re.search(r'{\\info.*?}', file_bytes.decode('utf-8', errors='replace'), re.DOTALL)
        if info_match:
            info_str = info_match.group(0)
            t_match = re.search(r'{\\title(.*?)}', info_str)
            if t_match: title = t_match.group(1).strip()
            a_match = re.search(r'{\\author(.*?)}', info_str)
            if a_match: author = a_match.group(1).strip()
            
        if not title and paragraphs:
            title = paragraphs[0]
            
        return {"title": title, "author": author, "blocks": blocks}
    except Exception as e:
        raise HTTPException(status_code=400, detail={"status": "error", "code": "INVALID_RTF", "message": str(e)})
