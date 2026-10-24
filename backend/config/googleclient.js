import { OAuth2Client } from "google-auth-library";
import dotenv from "dotenv";

dotenv.config();

export const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Verifies the ID token sent from the frontend (frontend uses Google Identity Services
// to get the token, backend just verifies it - no server-side redirect flow needed).
export async function verifyGoogleToken(idToken) {
  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  return ticket.getPayload(); // { email, name, sub (google_id), picture, ... }
}