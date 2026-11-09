export type PipelineStatus = "pending" | "creating" | "uploading" | "ingesting" | "quota" | "done" | "failed";

export type PipelineJobData = {
  jobChainId: string;
  orgId: string;
  driveFileId: string;
  fileName: string;
  pages: number;
  simulateFailure: boolean;
  caseId?: string;
  documentId?: string;
  s3Key?: string;
  signedUrl?: string;
};

export type PipelineRun = {
  _id: string;
  jobChainId: string;
  orgId: string;
  driveFileId: string;
  fileName: string;
  status: PipelineStatus;
  pages?: number;
  caseId?: string;
  documentId?: string;
  s3Key?: string;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
};

export type Organization = { _id: string; pagesUsed: number; chargedRuns: string[] };
