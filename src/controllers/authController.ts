import { Request, Response } from 'express';
import { SupabaseClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

// Ensure these environment variables are loaded
// and available before this module is imported.
// In index.ts, we already handle it with dotenv.config();
// 1. Load environment variables
dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;

// Define an interface for the registration request body
interface RegisterRequestBody {
  username: string;
  email: string;
  password: string;
  first_name: string;
  last_name: string;
}

// Define an interface for the login request body
interface LoginRequestBody {
  email?: string; // Can be email or username
  username?: string; // Can be email or username
  password: string;
}

// Function to register a new user
// Receives the Supabase client as an argument for dependency injection
export const registerUser = (supabase: SupabaseClient) => async (req: Request, res: Response) => {
  try {
    const { username, email, password, first_name, last_name }: RegisterRequestBody = req.body;

    // 1. Validate input data
    if (!username || !email || !password || !first_name || !last_name) {
      return res.status(400).json({ error: 'All fields are mandatory.' });
    }

    // 2. Hash the password
    // We generate a "salt" (random string) and then hash the password with it.
    // A cost of 10 is a good balance between security and performance for most apps.
    const hashedPassword = await bcrypt.hash(password, 10);

    // 3. Insert the new user into the database
    // We use the Supabase client to interact with the 'users' table
    const { data, error } = await supabase
      .from('users')
      .insert({
        username,
        email,
        password: hashedPassword, // Save the hashed password
        first_name,
        last_name,
        // created_at, updated_at, is_active are handled by default in the table
      })
      .select(); // Use .select() to get the data of the inserted user

    if (error) {
      // Handle duplicate errors (email or username already exist)
      if (error.code === '23505') { // PostgreSQL error code for unique constraint violation
        if (error.message.includes('users_email_key')) {
          return res.status(409).json({ error: 'The email is already registered.' });
        }
        if (error.message.includes('users_username_key')) {
          return res.status(409).json({ error: 'The username is already in use.' });
        }
      }
      console.error('Error registering user in Supabase:', error);
      return res.status(500).json({ error: 'Error registering user.' });
    }

    // 4. Successful response
    // We do not return the hashed password for security reasons
    const newUser = data[0]; // data is an array, we take the first element
    res.status(201).json({
      message: 'User registered successfully.',
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        first_name: newUser.first_name,
        last_name: newUser.last_name,
      },
    });

  } catch (err: any) {
    console.error('Exception in registerUser:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

// Function to log in
export const loginUser = (supabase: SupabaseClient) => async (req: Request, res: Response) => {
  try {
    const { email, username, password }: LoginRequestBody = req.body;

    // 1. Validate input data
    if (!password || (!email && !username)) {
      return res.status(400).json({ error: 'Email/Username and password are required.' });
    }

    // 2. Search for the user by email or username
    let userQuery;
    if (email) {
      userQuery = supabase.from('users').select('*').eq('email', email).single();
    } else if (username) {
      userQuery = supabase.from('users').select('*').eq('username', username).single();
    } else {
      return res.status(400).json({ error: 'You must provide either an email or a username.' });
    }

    const { data: user, error } = await userQuery;

    if (error || !user) {
      // If there's an error or the user is not found, it's a credentials failure
      console.error('Error searching for user or user not found:', error?.message || 'User not found');
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    // 3. Compare the provided password with the hashed password
    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    // 4. Generate the JWT
    // We include basic user information in the token payload.
    // NEVER include sensitive information like the hashed password!
    if (!JWT_SECRET) {
      console.error('JWT_SECRET is not defined. Cannot generate token.');
      return res.status(500).json({ error: 'Server configuration error.' });
    }

    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        username: user.username,
        // You can add more fields if you need them in the token, but keep it light
      },
      JWT_SECRET,
      { expiresIn: '6h' } // The token will expire in 1 hour
    );

    // 5. Successful response with the token
    res.status(200).json({
      message: 'Login successful.',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
      },
    });

  } catch (err: any) {
    console.error('Exception in loginUser:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};
