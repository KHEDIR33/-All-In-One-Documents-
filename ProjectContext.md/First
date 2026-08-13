PROJECT CONTEXT & AI HANDOVER DOCUMENT

Document Productivity Platform (SaaS)

---

1. Project Vision

This project starts as a PDF tools SaaS platform.

The first goal is to build a reliable document processing platform.

The long-term vision is to grow into a complete:

Document Productivity Platform

The current 7 core features must not be changed.

The system must be built with scalable architecture so future features can be added without rebuilding the project.

---

2. Technology Stack

Frontend

Technology:

- Framer

Responsibilities:

- Website interface
- User interaction
- API communication

---

Backend

Technology:

- Node.js
- Express

Hosting:

- Render Web Service

Repository:

- GitHub

Responsibilities:

- File processing
- Conversion services
- Payment handling
- Storage management
- API services
- Telegram Bot integration

---

Database

Technology:

- Supabase PostgreSQL

Future usage:

- Users
- Payments
- File history
- Credits
- Subscription plans
- Usage tracking

---

Storage

Technology:

- Supabase Storage

Usage:

- Uploaded files
- Processed files
- User documents

---

3. Current MVP Features (7 Features)

1. PDF to Word

Flow:

Select File → Upload → Convert → Payment → Save

2. Word to PDF

Flow:

Select File → Upload → Convert → Payment → Save

3. PDF to Excel

Flow:

Select File → Upload → Convert → Payment → Save

4. PDF Compression

Flow:

Select File → Upload → Compress → Payment → Save

5. File Lock / Unlock

Flow:

Select File → Upload → Process → Payment → Save

6. File Download

Flow:

Search → Select → Preview → Payment → Save

7. PDF Editing and Signing

Flow:

Select File → Upload → Edit/Sign → Payment → Save

---

4. Main User Experience Decision

The platform should follow a simple and fast workflow.

Main principle:

Select → Upload → Process → Payment → Save

The experience should be simple like modern PDF tools.

---

5. Document Processing Features Flow

Applies to:

- PDF to Word
- Word to PDF
- PDF to Excel
- PDF Compression
- File Lock / Unlock
- PDF Editing and Signing

1. Select File
        ↓
2. Upload File
        ↓
3. Convert / Process
        ↓
4. Payment Popup
        ↓
5. Payment Verification
        ↓
6. Save (Download to Device)

---

6. File Download Feature Flow

File Download is different because there is no conversion process.

The user must preview the document before saving.

1. Search File
        ↓
2. Select File
        ↓
3. Preview / Open File
        ↓
4. Payment Popup
        ↓
5. Payment Verification
        ↓
6. Save (Download to Device)

---

7. Payment Architecture Decision

Important rule:

Payment must always happen before Save.

Reason:

- Protect paid files
- Prevent unauthorized downloads
- Support future subscription and credit systems

Payment Flow:

Process / Preview
        ↓
Payment Popup
        ↓
Payment Verification
        ↓
Save (Download to Device)

Payment Providers:

Local:

- Telebirr
- Chapa

International:

- International payment gateway

---

8. File Storage & Auto Delete Policy

User Saved Documents

Files that belong to the user should be stored according to user storage policy.

Future support:

- User dashboard
- My Documents
- File history

---

Converted / Generated Files

Example:

PDF → Word

Flow:

Upload
 ↓
Convert / Process
 ↓
Payment Verification
 ↓
Save (Download to Device)
 ↓
After 3 minutes → Delete processed file

Purpose:

- Reduce storage usage
- Improve security
- Control server cost

---

File Download Feature Files

Flow:

Search File
 ↓
Preview
 ↓
Payment
 ↓
Save (Download to Device)
 ↓
After 30 minutes → Delete temporary access file

---

9. Backend Architecture Rules

The backend must be modular and scalable.

Recommended structure:

backend/

src/

controllers/

routes/

services/

middleware/

database/

storage/

payments/

utils/

---

Services:

pdfToWordService

pdfToExcelService

compressionService

storageService

paymentService

---

Important:

Do not create separate payment logic for every feature.

Use shared services:

Payment Service
        ↓
Save Service

---

10. UX Design Direction

Reference:

Simple workflow:

- iLovePDF

Clean design:

- Smallpdf

Future capability:

- Adobe Acrobat

Goal:

Simple User Experience
+
Beautiful Interface
+
Powerful Future Features

---

11. Future SaaS Expansion

Current MVP features remain the priority.

Future features:

User Dashboard

- File history
- Account management
- Usage tracking

Credit System

Free:

- Limited usage

Premium:

- More credits

AI Document Assistant

Future:

- PDF summary
- Ask questions about documents
- Information extraction
- Translation

Cloud Document Storage

Users can store documents online.

Team Collaboration

- Shared documents
- Business accounts

API Access

External applications can use document services.

---

12. Development Rules

Before changing code:

1. Understand existing code.
2. Review current architecture.
3. Protect working features.
4. Avoid unnecessary rewrites.

Principles:

- Clean code
- Modular architecture
- Security
- Scalability
- Reusable services

---

13. First Task When Continuing Development

When ZIP code is provided:

Step 1:
Analyze existing project.

Step 2:
Review:

- Folder structure
- Backend setup
- APIs
- Dependencies
- Environment variables
- Database connection

Step 3:

Create:

- Completed features list
- Missing features list
- Bug list
- Development roadmap

Step 4:

Continue development according to this document.

---

AI Assistant Role

Act as a long-term technical partner.

The goal is not only to finish the first version.

The goal is to build a scalable SaaS product.

Always consider:

- Current MVP
- Future expansion
- User experience
- Clean architecture
- Long-term maintainability
