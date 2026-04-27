import { relations } from "drizzle-orm";

import { embeddingChunks } from "@/lib/db/schema/embedding-chunks";
import { embeddingJobs } from "@/lib/db/schema/embedding-jobs";
import { emailVerificationTokens, passwordResetTokens } from "@/lib/db/schema/auth-tokens";
import { fileChunks } from "@/lib/db/schema/file-chunks";
import { fileVersions } from "@/lib/db/schema/file-versions";
import { files } from "@/lib/db/schema/files";
import { folders } from "@/lib/db/schema/folders";
import { pdfPreviewPages } from "@/lib/db/schema/pdf-preview-pages";
import {
  shareLinkAccessLogs,
  shareLinkEmails,
  shareLinkOtps,
  shareLinks,
} from "@/lib/db/schema/sharing";
import { sessions } from "@/lib/db/schema/sessions";
import { uploadSessions } from "@/lib/db/schema/upload-sessions";
import { users } from "@/lib/db/schema/users";

export * from "@/lib/db/schema/auth-tokens";
export * from "@/lib/db/schema/embedding-chunks";
export * from "@/lib/db/schema/embedding-jobs";
export * from "@/lib/db/schema/file-chunks";
export * from "@/lib/db/schema/file-versions";
export * from "@/lib/db/schema/files";
export * from "@/lib/db/schema/folders";
export * from "@/lib/db/schema/pdf-preview-pages";
export * from "@/lib/db/schema/sharing";
export * from "@/lib/db/schema/sessions";
export * from "@/lib/db/schema/upload-sessions";
export * from "@/lib/db/schema/users";

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  folders: many(folders),
  files: many(files),
  shareLinks: many(shareLinks),
  uploadSessions: many(uploadSessions),
  passwordResetTokens: many(passwordResetTokens),
  emailVerificationTokens: many(emailVerificationTokens),
  embeddingJobs: many(embeddingJobs),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.user_id], references: [users.id] }),
}));

export const foldersRelations = relations(folders, ({ one, many }) => ({
  user: one(users, { fields: [folders.user_id], references: [users.id] }),
  parent: one(folders, { fields: [folders.parent_id], references: [folders.id] }),
  children: many(folders),
  files: many(files),
  shareLinks: many(shareLinks),
}));

export const filesRelations = relations(files, ({ one, many }) => ({
  user: one(users, { fields: [files.user_id], references: [users.id] }),
  folder: one(folders, { fields: [files.folder_id], references: [folders.id] }),
  chunks: many(fileChunks),
  shareLinks: many(shareLinks),
  uploadSessions: many(uploadSessions),
  versions: many(fileVersions),
  embeddingJobs: many(embeddingJobs),
  embeddingChunks: many(embeddingChunks),
  pdfPreviewPages: many(pdfPreviewPages),
}));

export const fileChunksRelations = relations(fileChunks, ({ one }) => ({
  file: one(files, { fields: [fileChunks.file_id], references: [files.id] }),
}));

export const pdfPreviewPagesRelations = relations(pdfPreviewPages, ({ one }) => ({
  file: one(files, {
    fields: [pdfPreviewPages.file_id],
    references: [files.id],
  }),
}));

export const shareLinksRelations = relations(shareLinks, ({ one, many }) => ({
  file: one(files, { fields: [shareLinks.file_id], references: [files.id] }),
  folder: one(folders, { fields: [shareLinks.folder_id], references: [folders.id] }),
  createdBy: one(users, { fields: [shareLinks.created_by], references: [users.id] }),
  emails: many(shareLinkEmails),
  otps: many(shareLinkOtps),
  accessLogs: many(shareLinkAccessLogs),
}));

export const shareLinkEmailsRelations = relations(shareLinkEmails, ({ one }) => ({
  link: one(shareLinks, { fields: [shareLinkEmails.link_id], references: [shareLinks.id] }),
}));

export const shareLinkOtpsRelations = relations(shareLinkOtps, ({ one }) => ({
  link: one(shareLinks, { fields: [shareLinkOtps.link_id], references: [shareLinks.id] }),
}));

export const shareLinkAccessLogsRelations = relations(shareLinkAccessLogs, ({ one }) => ({
  link: one(shareLinks, {
    fields: [shareLinkAccessLogs.link_id],
    references: [shareLinks.id],
  }),
}));

export const uploadSessionsRelations = relations(uploadSessions, ({ one }) => ({
  user: one(users, { fields: [uploadSessions.user_id], references: [users.id] }),
  file: one(files, { fields: [uploadSessions.file_id], references: [files.id] }),
}));

export const fileVersionsRelations = relations(fileVersions, ({ one }) => ({
  file: one(files, { fields: [fileVersions.file_id], references: [files.id] }),
}));

export const passwordResetTokensRelations = relations(passwordResetTokens, ({ one }) => ({
  user: one(users, { fields: [passwordResetTokens.user_id], references: [users.id] }),
}));

export const emailVerificationTokensRelations = relations(emailVerificationTokens, ({ one }) => ({
  user: one(users, {
    fields: [emailVerificationTokens.user_id],
    references: [users.id],
  }),
}));

export const embeddingJobsRelations = relations(embeddingJobs, ({ one, many }) => ({
  file: one(files, { fields: [embeddingJobs.file_id], references: [files.id] }),
  triggeredBy: one(users, { fields: [embeddingJobs.triggered_by], references: [users.id] }),
  chunks: many(embeddingChunks),
}));

export const embeddingChunksRelations = relations(embeddingChunks, ({ one }) => ({
  job: one(embeddingJobs, {
    fields: [embeddingChunks.job_id],
    references: [embeddingJobs.id],
  }),
  file: one(files, { fields: [embeddingChunks.file_id], references: [files.id] }),
}));
