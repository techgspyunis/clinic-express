import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// Extend the Express Request interface to add the 'user' property
// This allows us to attach the decoded user information from the JWT
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        email: string;
        username: string;
        // You can add more properties if you include them in your JWT payload
      };
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET;

export const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
  // 1. Get the authorization header
  const authHeader = req.headers['authorization'];
  // The token usually comes as "Bearer TOKEN_HERE"
  const token = authHeader && authHeader.split(' ')[1];

  // 2. Check if no token is provided
  if (token == null) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  // 3. Check if JWT_SECRET is defined
  if (!JWT_SECRET) {
    console.error('JWT_SECRET is not defined in the environment.');
    return res.status(500).json({ error: 'Server configuration error.' });
  }

  // 4. Verify the token
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      // If the token is invalid (expired, malformed, etc.)
      console.error('Error verifying token:', err.message);
      return res.status(403).json({ error: 'Invalid or expired token.' });
    }

    // If the token is valid, we attach the user information to the request
    // so that subsequent controllers can access it.
    req.user = user as Request['user'];
    next(); // Continue with the next middleware function or route handler
  });
};
