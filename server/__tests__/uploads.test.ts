import { describe, it, expect } from "vitest";
import {
  excuseUpload,
  excuseUploadLimits,
  fileFilter as excuseFileFilter,
} from "../middleware/uploads";

describe("excuseUpload multer config", () => {
  it("enforces 5MB size limit", () => {
    expect(excuseUploadLimits.fileSize).toBe(5 * 1024 * 1024);
  });

  it("accepts allowed MIME types", () => {
    let accepted = false;
    excuseFileFilter(
      {},
      { mimetype: "application/pdf" },
      (err, ok) => {
        expect(err).toBeNull();
        accepted = ok === true || ok === undefined;
      },
    );
    expect(accepted).toBe(true);
  });

  it("rejects unsafe MIME types", () => {
    let error: Error | null = null;
    excuseFileFilter({}, { mimetype: "application/x-msdownload" }, (err) => {
      error = err;
    });
    expect(error).toBeInstanceOf(Error);
    expect(error?.message).toMatch(/Only PDF or image uploads are allowed/);
  });
});
