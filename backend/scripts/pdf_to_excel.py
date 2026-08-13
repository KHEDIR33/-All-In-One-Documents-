#!/usr/bin/env python3
import sys, os, csv, subprocess, tempfile, math
from openpyxl import Workbook
import pdfplumber

def clean(v):
    return (v or "").replace("\x00", "").strip()

def extract_normal(pdf_path):
    rows = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            tables = page.extract_tables(
                table_settings={
                    "vertical_strategy": "lines",
                    "horizontal_strategy": "lines",
                    "snap_tolerance": 3,
                    "join_tolerance": 3,
                    "edge_min_length": 3,
                }
            )
            if tables:
                for table in tables:
                    for row in table:
                        rows.append([clean(x) for x in row])
            else:
                words = page.extract_words(use_text_flow=True, keep_blank_chars=False)
                if words:
                    lines = {}
                    for w in words:
                        key = round(float(w["top"]), 1)
                        lines.setdefault(key, []).append(w)
                    for _, ws in sorted(lines.items()):
                        ws.sort(key=lambda x: float(x["x0"]))
                        rows.append([clean(w["text"]) for w in ws])
    return rows

def extract_ocr(pdf_path, lang):
    rows = []
    with tempfile.TemporaryDirectory(prefix="aio-ocr-") as td:
        prefix=os.path.join(td,"page")
        subprocess.run(["pdftoppm","-r","200","-png",pdf_path,prefix],check=True,
                       stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
        for img in sorted(x for x in os.listdir(td) if x.endswith(".png")):
            ip=os.path.join(td,img)
            p=subprocess.run(["tesseract",ip,"stdout","--psm","6","-l",lang,"tsv"],
                             check=True,capture_output=True,text=True)
            lines={}
            for line in p.stdout.splitlines()[1:]:
                parts=line.split("\t")
                if len(parts) < 12: continue
                try:
                    level=int(parts[0]); conf=float(parts[10])
                except: continue
                text=clean(parts[11])
                if level != 5 or not text or conf < 20: continue
                key=(parts[1],parts[2],parts[3],parts[4],parts[5])
                lines.setdefault(key, []).append((int(parts[6]),text,int(parts[7])))
            grouped={}
            for (block,par,par2,line,word), vals in lines.items():
                # tesseract TSV line identity is the first five hierarchy fields
                key=(block,par,par2,line)
                grouped.setdefault(key,[]).extend(vals)
            for key, vals in sorted(grouped.items(), key=lambda kv:(int(kv[0][0]),int(kv[0][1]),int(kv[0][2]),int(kv[0][3]))):
                vals.sort()
                rows.append([v[1] for v in vals])
    return rows

def main():
    if len(sys.argv) != 4:
        raise SystemExit("usage: pdf_to_excel.py INPUT.pdf OUTPUT.xlsx MODE")
    inp,out,mode=sys.argv[1:]
    if mode == "ocr":
        rows=extract_ocr(inp, os.environ.get("OCR_LANG","eng+amh"))
    else:
        rows=extract_normal(inp)
    if not rows:
        raise RuntimeError("No tabular/text content could be extracted from PDF")
    wb=Workbook()
    ws=wb.active
    ws.title="Sheet1"
    for r,row in enumerate(rows,1):
        for c,val in enumerate(row,1):
            ws.cell(r,c,val)
    # reasonable widths
    for col in ws.columns:
        maxlen=max((len(str(cell.value or "")) for cell in col), default=0)
        ws.column_dimensions[col[0].column_letter].width=min(max(maxlen+2,10),60)
    wb.save(out)

if __name__=="__main__":
    main()
