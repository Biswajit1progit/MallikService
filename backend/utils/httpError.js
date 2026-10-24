// One small error class used by the new controllers/services.
// Throw it anywhere; sendError() turns it into a clean JSON response.
export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra; // optional extra JSON fields, e.g. { suggestedDate }
  }
}

export function sendError(res, err, label = "Request") {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ message: err.message, ...err.extra });
  }
  console.error(`${label} error:`, err);
  return res.status(500).json({ message: "Something went wrong. Please try again." });
}