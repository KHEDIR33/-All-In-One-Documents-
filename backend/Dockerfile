FROM node:20-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       libreoffice-writer \
       libreoffice-calc \
       libreoffice-core \
       poppler-utils \
       ghostscript \
       qpdf \
       pdftk-java \
       python3 \
       python3-pip \
       tesseract-ocr \
       tesseract-ocr-eng \
       tesseract-ocr-amh \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN python3 -m pip install --no-cache-dir --break-system-packages pdfplumber openpyxl \
    && npm install --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PORT=10000

EXPOSE 10000

CMD ["node", "src/server.js"]
