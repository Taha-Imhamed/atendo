import { Request, Response, NextFunction } from "express";
import { ApiError } from "../errors/apiError";
import { courseService } from "../services/courseService";
import { sessionService } from "../services/sessionService";
import { authService } from "../services/authService";
import { excuseService } from "../services/excuseService";
import { professorRosterUploadDir } from "../middleware/uploads";
import { rosterImportService } from "../services/rosterImportService";
import { professorAccountService } from "../services/professorAccountService";
import { buildFallbackStudentEmail } from "../utils/studentEmail";
import { accountCredentialService } from "../services/accountCredentialService";
import { userRepository } from "../repositories/userRepository";
import fs from "fs";
import path from "path";

export const professorController = {
  async listCourses(req: Request, res: Response, next: NextFunction) {
    try {
      const courses = await courseService.listProfessorCourses(req.user!.id);
      res.json({ courses });
    } catch (error) {
      next(error);
    }
  },

  async createCourse(req: Request, res: Response, next: NextFunction) {
    try {
      const { course, defaultGroup } = await courseService.createCourse(req.user!.id, {
        code: req.body.code,
        name: req.body.name,
        term: req.body.term,
        description: req.body.description,
      });
      res.status(201).json({ course, defaultGroup });
    } catch (error) {
      next(error);
    }
  },

  async createGroup(req: Request, res: Response, next: NextFunction) {
    try {
      const courseId = req.params.courseId;
      const payload = req.body;

      const group = await courseService.createGroup(req.user!.id, courseId, {
        name: payload.name,
        meeting_schedule: payload.meeting_schedule,
      });

      res.status(201).json(group);
    } catch (error) {
      next(error);
    }
  },

  async deleteCourse(req: Request, res: Response, next: NextFunction) {
    try {
      const { courseId } = req.params;
      const result = await courseService.deleteCourse(req.user!.id, courseId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },

  async startSession(req: Request, res: Response, next: NextFunction) {
    try {
      const { groupId } = req.params;
      const result = await sessionService.startSession(req.user!.id, groupId, {
        geofenceEnabled: Boolean(req.body?.geofenceEnabled),
        latitude:
          req.body?.latitude !== undefined ? Number(req.body.latitude) : null,
        longitude:
          req.body?.longitude !== undefined ? Number(req.body.longitude) : null,
        geofenceRadiusM:
          req.body?.geofenceRadiusM !== undefined
            ? Number(req.body.geofenceRadiusM)
            : null,
        isBreakRound: Boolean(req.body?.isBreakRound),
      });
      res.status(201).json({
        session: result.session,
        course: result.course,
        group: result.group,
        round: result.round,
        qr: result.token
          ? {
              token: result.token.rawToken,
              expiresAt: result.token.expiresAt.toISOString(),
              qrPayload: result.qrPayload,
              roundId: result.round.id,
              geofenceEnabled: result.round.geofence_enabled,
              geofenceRadiusM: result.round.geofence_radius_m,
              latitude: result.round.latitude,
              longitude: result.round.longitude,
            }
          : null,
      });
    } catch (error) {
      next(error);
    }
  },

  async startRound(req: Request, res: Response, next: NextFunction) {
    try {
      const { sessionId } = req.params;
      const { round, token, qrPayload } = await sessionService.startRound(
        req.user!.id,
        sessionId,
        {
          geofenceEnabled: Boolean(req.body?.geofenceEnabled),
          latitude:
            req.body?.latitude !== undefined ? Number(req.body.latitude) : null,
          longitude:
            req.body?.longitude !== undefined
              ? Number(req.body.longitude)
              : null,
          geofenceRadiusM:
              req.body?.geofenceRadiusM !== undefined
                ? Number(req.body.geofenceRadiusM)
                : null,
          isBreakRound: Boolean(req.body?.isBreakRound),
        },
      );
      res.status(201).json({
        round,
        qr: token
          ? {
              token: token.rawToken,
              expiresAt: token.expiresAt.toISOString(),
              qrPayload,
              roundId: round.id,
              geofenceEnabled: round.geofence_enabled,
              geofenceRadiusM: round.geofence_radius_m,
              latitude: round.latitude,
              longitude: round.longitude,
            }
          : null,
      });
    } catch (error) {
      next(error);
    }
  },

  async endRound(req: Request, res: Response, next: NextFunction) {
    try {
      const { sessionId, roundId } = req.params;
      const result = await sessionService.closeRound(
        req.user!.id,
        sessionId,
        roundId,
      );
      res.status(200).json({
        round: result.round,
        sessionId: result.session.id,
        endedAt: result.round.ends_at,
      });
    } catch (error) {
      next(error);
    }
  },

  async endSession(req: Request, res: Response, next: NextFunction) {
    try {
      const { sessionId } = req.params;
      await sessionService.endSession(req.user!.id, sessionId);
      res.status(200).json({ message: "Session ended" });
    } catch (error) {
      next(error);
    }
  },

  async getSessionStats(req: Request, res: Response, next: NextFunction) {
    try {
      const { sessionId } = req.params;
      const stats = await sessionService.getSessionStats(req.user!.id, sessionId);
      res.json(stats);
    } catch (error) {
      next(error);
    }
  },

  async getSessionDetail(req: Request, res: Response, next: NextFunction) {
    try {
      const { sessionId } = req.params;
      const detail = await sessionService.getSessionDetail(
        req.user!.id,
        sessionId,
      );
      res.json(detail);
    } catch (error) {
      next(error);
    }
  },

  async createUserAccount(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, username, display_name, password, role } = req.body;

      if (!username || !display_name || !role) {
        throw new ApiError(400, "Username, display name, and role are required.");
      }

      if (role !== "student" && role !== "professor") {
        throw new ApiError(400, "Role must be student or professor.");
      }

      const normalizedUsername = String(username).trim();
      const normalizedDisplayName = String(display_name).trim();
      const normalizedEmail =
        typeof email === "string" && email.trim()
          ? email.trim().toLowerCase()
          : role === "student"
            ? buildFallbackStudentEmail(normalizedUsername)
            : "";
      const normalizedPassword =
        typeof password === "string" && password.trim()
          ? password.trim()
          : role === "student"
            ? authService.STANDARD_TEMP_PASSWORD
            : "";

      if (!normalizedEmail) {
        throw new ApiError(400, "Email is required for professor accounts.");
      }

      if (!normalizedPassword) {
        throw new ApiError(400, "Password is required for professor accounts.");
      }

      const existingByUsername = await userRepository.findByUsername(
        normalizedUsername,
      );
      const existingByEmail = normalizedEmail
        ? await userRepository.findByEmail(normalizedEmail)
        : null;
      const existing = existingByUsername ?? existingByEmail;

      if (existing) {
        if (role === "student" && existing.role === "student") {
          res.status(200).json({
            id: existing.id,
            email: existing.email,
            username: existing.username,
            display_name: existing.display_name,
            role: existing.role,
          });
          return;
        }
        throw new ApiError(409, "Username or email already exists.");
      }

      const user = await authService.registerUser({
        email: normalizedEmail,
        username: normalizedUsername,
        display_name: normalizedDisplayName,
        password: normalizedPassword,
        role,
        created_by_professor_id: role === "student" ? req.user!.id : undefined,
        must_change_password: role === "student",
      });
      if (role === "student") {
        await accountCredentialService.recordCredential(
          req.user!.id,
          user.id,
          normalizedPassword,
          "manual_create",
        );
      }

      res.status(201).json({
        id: user.id,
        email: user.email,
        username: user.username,
        display_name: user.display_name,
        role: user.role,
      });
    } catch (error) {
      next(error);
    }
  },

  async exportSession(req: Request, res: Response, next: NextFunction) {
    try {
      const { sessionId } = req.params;
      const { session, course, group, records } =
        await sessionService.getSessionExport(req.user!.id, sessionId);

      const headers = [
        "round_number",
        "round_id",
        "student_username",
        "student_name",
        "status",
        "recorded_at",
      ];

      const escape = (value: string | number | null) => {
        if (value === null || value === undefined) return "";
        const str = String(value);
        if (str.includes(",") || str.includes("\"") || str.includes("\n")) {
          return `"${str.replace(/\"/g, "\"\"")}"`;
        }
        return str;
      };

      const csvLines = [
        headers.join(","),
        ...records.map((row: {
          roundNumber: number;
          roundId: string;
          studentUsername: string;
          studentName: string;
          status: string;
          recordedAt: string | null;
        }) =>
          [
            row.roundNumber,
            row.roundId,
            row.studentUsername,
            row.studentName,
            row.status,
            row.recordedAt,
          ]
            .map(escape)
            .join(","),
        ),
      ];

      const filename = `${course?.code ?? "session"}-${group?.name ?? "group"}-${
        session.id
      }.csv`;

      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`,
      );
      res.status(200).send(csvLines.join("\n"));
    } catch (error) {
      next(error);
    }
  },

  async approveExcuse(req: Request, res: Response, next: NextFunction) {
    try {
      const updated = await excuseService.reviewExcuse(
        req.user!.id,
        req.params.excuseId,
        "approve",
        req.body?.note,
      );
      res.json(updated);
    } catch (error) {
      next(error);
    }
  },

  async rejectExcuse(req: Request, res: Response, next: NextFunction) {
    try {
      const updated = await excuseService.reviewExcuse(
        req.user!.id,
        req.params.excuseId,
        "reject",
        req.body?.note,
      );
      res.json(updated);
    } catch (error) {
      next(error);
    }
  },

  async getSessionAnalytics(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await sessionService.getSessionAnalytics(
        req.user!.id,
        req.params.sessionId,
      );
      res.json(data);
    } catch (error) {
      next(error);
    }
  },

  async listAttendanceLogDates(req: Request, res: Response, next: NextFunction) {
    try {
      const dates = await sessionService.listSessionLogDates(req.user!.id);
      res.json({ dates });
    } catch (error) {
      next(error);
    }
  },

  async getAttendanceLogByDate(req: Request, res: Response, next: NextFunction) {
    try {
      const date =
        typeof req.query.date === "string" ? req.query.date : "";
      const log = await sessionService.getAttendanceLogByDate(req.user!.id, date);
      res.json(log);
    } catch (error) {
      next(error);
    }
  },

  async exportAttendanceLogByDate(req: Request, res: Response, next: NextFunction) {
    try {
      const date =
        typeof req.query.date === "string" ? req.query.date : "";
      const csv = await sessionService.exportAttendanceLogByDate(req.user!.id, date);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="attendance-log-${date || "date"}.csv"`,
      );
      res.status(200).send(csv);
    } catch (error) {
      next(error);
    }
  },

  async exportSessionAnalytics(req: Request, res: Response, next: NextFunction) {
    try {
      const csv = await sessionService.exportSessionAnalytics(
        req.user!.id,
        req.params.sessionId,
      );
      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=\"analytics-${req.params.sessionId}.csv\"`,
      );
      res.status(200).send(csv);
    } catch (error) {
      next(error);
    }
  },

  async uploadRosterFile(req: Request, res: Response, next: NextFunction) {
    try {
      const uploaded = (req as any).file as Express.Multer.File | undefined;
      if (!uploaded) {
        throw new ApiError(400, "Roster file is required.");
      }
      res.status(201).json({
        fileName: uploaded.filename,
        originalName: uploaded.originalname,
        uploadedAt: new Date().toISOString(),
        size: uploaded.size,
      });
    } catch (error) {
      next(error);
    }
  },

  async importRosterAccounts(req: Request, res: Response, next: NextFunction) {
    try {
      const uploaded = (req as any).file as Express.Multer.File | undefined;
      if (!uploaded) {
        throw new ApiError(400, "Roster file is required.");
      }

      const groupId =
        typeof req.body?.groupId === "string" && req.body.groupId.trim()
          ? req.body.groupId.trim()
          : undefined;

      const result = await rosterImportService.provisionFromFile({
        professorId: req.user!.id,
        groupId,
        filePath: uploaded.path,
      });

      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  },

  async resetStudentPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const studentId = req.params.studentId;
      const password =
        typeof req.body?.password === "string" ? req.body.password : undefined;
      const result = await authService.resetStudentPasswordByProfessor(
        req.user!.id,
        studentId,
        password,
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  },

  async listManagedUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const users = await professorAccountService.listManagedUsers(req.user!.id);
      res.json({ users });
    } catch (error) {
      next(error);
    }
  },

  async getStudentCredential(req: Request, res: Response, next: NextFunction) {
    try {
      const credential = await professorAccountService.getStudentCredential(
        req.user!.id,
        req.params.studentId,
      );
      res.json(credential);
    } catch (error) {
      next(error);
    }
  },

  async exportManagedAccounts(req: Request, res: Response, next: NextFunction) {
    try {
      const csv = await professorAccountService.exportManagedStudentsCsv(
        req.user!.id,
      );
      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="managed-students-accounts.csv"`,
      );
      res.status(200).send(csv);
    } catch (error) {
      next(error);
    }
  },

  async exportAttendancePeriodReport(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const period =
        req.query.period === "monthly" ? "monthly" : "weekly";
      const csv = await sessionService.exportPeriodAttendanceCsv(
        req.user!.id,
        period,
      );
      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="attendance-${period}-report.csv"`,
      );
      res.status(200).send(csv);
    } catch (error) {
      next(error);
    }
  },

  async getCourseAttendanceSummary(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const courseId =
        typeof req.query.courseId === "string" ? req.query.courseId : "";
      const report = await sessionService.getCourseAttendanceSummary(
        req.user!.id,
        courseId,
      );
      res.json(report);
    } catch (error) {
      next(error);
    }
  },

  async updateManagedUser(req: Request, res: Response, next: NextFunction) {
    try {
      const updated = await professorAccountService.updateManagedUser(
        req.user!.id,
        req.params.userId,
        {
          username:
            typeof req.body?.username === "string" ? req.body.username : undefined,
          email: typeof req.body?.email === "string" ? req.body.email : undefined,
          display_name:
            typeof req.body?.display_name === "string"
              ? req.body.display_name
              : undefined,
        },
      );
      res.json(updated);
    } catch (error) {
      next(error);
    }
  },

  async listRosterFiles(req: Request, res: Response, next: NextFunction) {
    try {
      const ownerPrefix = `${req.user!.id}__`;
      const files = fs
        .readdirSync(professorRosterUploadDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.startsWith(ownerPrefix))
        .map((entry) => {
          const fullPath = path.join(professorRosterUploadDir, entry.name);
          const stats = fs.statSync(fullPath);
          const [, timestampPart, ...nameParts] = entry.name.split("__");
          const timestamp = Number(timestampPart);
          const originalName = nameParts.join("__");
          return {
            fileName: entry.name,
            originalName: originalName || entry.name,
            size: stats.size,
            uploadedAt: Number.isFinite(timestamp)
              ? new Date(timestamp).toISOString()
              : new Date(stats.mtimeMs).toISOString(),
          };
        })
        .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));

      res.json({ files });
    } catch (error) {
      next(error);
    }
  },

  async downloadRosterFile(req: Request, res: Response, next: NextFunction) {
    try {
      const requested = path.basename(req.params.fileName);
      const ownerPrefix = `${req.user!.id}__`;
      if (!requested.startsWith(ownerPrefix)) {
        throw new ApiError(403, "You can only download your own files.");
      }

      const resolved = path.resolve(professorRosterUploadDir, requested);
      if (!resolved.startsWith(professorRosterUploadDir)) {
        throw new ApiError(400, "Invalid file path.");
      }
      if (!fs.existsSync(resolved)) {
        throw new ApiError(404, "File not found.");
      }

      const originalName = requested.split("__").slice(2).join("__") || requested;
      res.setHeader("Content-Disposition", `attachment; filename="${originalName}"`);
      res.sendFile(resolved);
    } catch (error) {
      next(error);
    }
  },
};
