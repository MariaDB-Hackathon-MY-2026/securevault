# SecureVault - Project Overview

## What is SecureVault?

SecureVault is an **encrypted file storage web application** that provides:

- **End-to-end encrypted file storage** using AES-256-GCM with a 3-tier key hierarchy
- **Secure link sharing** with expiry, email allowlists, OTP verification, and revocation
- **AI-powered file management** using Vercel AI SDK _(stretch goal)_
- **Additive PDF semantic search** triggered after upload for eligible PDFs
- **Fine-grained access control** with application-level row-level security

## Problem Statement

Cloud storage services like Google Drive or Dropbox store files in plaintext on their servers. If a breach occurs, all user files are exposed. SecureVault encrypts every file **server-side before storage**, so even if the storage bucket is compromised, data remains unreadable without the encryption keys.

## Key Features (MVP)

| Feature                 | Description                                                    |
| ----------------------- | -------------------------------------------------------------- |
| **Encrypted upload**    | Files split into 5MB chunks, each encrypted with AES-256-GCM   |
| **Streaming download**  | Chunks decrypted on-the-fly and streamed to client             |
| **Multi-device auth**   | Session-based with Argon2id, refresh tokens, device management |
| **Secure sharing**      | nanoid tokens, expiry, email allowlists, OTP verification      |
| **Folder organization** | Nested folders with breadcrumb navigation                      |
| **Bulk operations**     | Select multiple files to delete, move, or securely share       |
| **Trash/restore**       | Soft delete with 30-day auto-cleanup                           |
| **File versioning**     | Last 5 versions preserved, restore any version                 |
| **Thumbnails**          | Encrypted thumbnails for image preview                         |
| **Rate limiting**       | In-memory rate limiter on sensitive endpoints                  |
| **Storage quota**       | 1GB per user, enforced server-side                             |
| **PDF semantic search** | Optional post-upload indexing for PDFs <= 10MB (additive path) |

## Stretch Goals

| Feature          | Description                                                |
| ---------------- | ---------------------------------------------------------- |
| **AI Agent**     | Natural language file search, summarization, smart sharing |
| **PDF Indexing** | Semantic PDF retrieval backed by MariaDB vector search     |
| **2FA / TOTP**   | Optional two-factor authentication via authenticator app   |

## Target Users

- Privacy-conscious individuals who want encrypted file storage
- Small teams needing secure file sharing with audit logs
- Anyone who distrusts plaintext cloud storage providers

## Hackathon Context

Built for **MariaDB Hackathon MY 2026**. MariaDB serves as the metadata and key store, while Cloudflare R2 holds encrypted file blobs.
