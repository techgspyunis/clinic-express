import { Request, Response } from 'express';
import { SupabaseClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

// Asegúrate de que estas variables de entorno estén cargadas
// y disponibles antes de que este módulo se importe.
// En index.ts ya lo manejamos con dotenv.config();
// 1. Cargar variables de entorno
dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;

// Definimos una interfaz para el cuerpo de la petición de registro
interface RegisterRequestBody {
  username: string;
  email: string;
  password: string;
  first_name: string;
  last_name: string;
}

// Definimos una interfaz para el cuerpo de la petición de login
interface LoginRequestBody {
  email?: string; // Puede ser email o username
  username?: string; // Puede ser email o username
  password: string;
}

// Función para registrar un nuevo usuario
// Recibe el cliente de Supabase como argumento para la inyección de dependencias
export const registerUser = (supabase: SupabaseClient) => async (req: Request, res: Response) => {
  try {
    const { username, email, password, first_name, last_name }: RegisterRequestBody = req.body;

    // 1. Validar datos de entrada
    if (!username || !email || !password || !first_name || !last_name) {
      return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
    }

    // 2. Hashear la contraseña
    // Generamos un "salt" (cadena aleatoria) y luego hasheamos la contraseña con él.
    // El costo de 10 es un buen balance entre seguridad y rendimiento para la mayoría de las apps.
    const hashedPassword = await bcrypt.hash(password, 10);

    // 3. Insertar el nuevo usuario en la base de datos
    // Usamos el cliente de Supabase para interactuar con la tabla 'users'
    const { data, error } = await supabase
      .from('users')
      .insert({
        username,
        email,
        password: hashedPassword, // Guardamos la contraseña hasheada
        first_name,
        last_name,
        // created_at, updated_at, is_active se manejan por defecto en la tabla
      })
      .select(); // Usamos .select() para obtener los datos del usuario insertado

    if (error) {
      // Manejar errores de duplicidad (email o username ya existen)
      if (error.code === '23505') { // Código de error de PostgreSQL para violación de restricción única
        if (error.message.includes('users_email_key')) {
          return res.status(409).json({ error: 'El email ya está registrado.' });
        }
        if (error.message.includes('users_username_key')) {
          return res.status(409).json({ error: 'El nombre de usuario ya está en uso.' });
        }
      }
      console.error('Error al registrar usuario en Supabase:', error);
      return res.status(500).json({ error: 'Error al registrar usuario.' });
    }

    // 4. Respuesta exitosa
    // No devolvemos la contraseña hasheada por seguridad
    const newUser = data[0]; // data es un array, tomamos el primer elemento
    res.status(201).json({
      message: 'Usuario registrado exitosamente.',
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        first_name: newUser.first_name,
        last_name: newUser.last_name,
      },
    });

  } catch (err: any) {
    console.error('Excepción en registerUser:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

// Función para iniciar sesión
export const loginUser = (supabase: SupabaseClient) => async (req: Request, res: Response) => {
  try {
    const { email, username, password }: LoginRequestBody = req.body;

    // 1. Validar datos de entrada
    if (!password || (!email && !username)) {
      return res.status(400).json({ error: 'Email/Username y contraseña son obligatorios.' });
    }

    // 2. Buscar el usuario por email o username
    let userQuery;
    if (email) {
      userQuery = supabase.from('users').select('*').eq('email', email).single();
    } else if (username) {
      userQuery = supabase.from('users').select('*').eq('username', username).single();
    } else {
      return res.status(400).json({ error: 'Debe proporcionar un email o un nombre de usuario.' });
    }

    const { data: user, error } = await userQuery;

    if (error || !user) {
      // Si hay error o el usuario no se encuentra, es un fallo de credenciales
      console.error('Error al buscar usuario o usuario no encontrado:', error?.message || 'Usuario no encontrado');
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }

    console.log('secret from controller', JWT_SECRET);

    // 3. Comparar la contraseña proporcionada con la contraseña hasheada
    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }

    // 4. Generar el JWT
    // Incluimos información básica del usuario en el payload del token.
    // ¡NUNCA incluyas información sensible como la contraseña hasheada!
    if (!JWT_SECRET) {
      console.error('JWT_SECRET no está definido. No se puede generar el token.');
      return res.status(500).json({ error: 'Error de configuración del servidor.' });
    }

    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        username: user.username,
        // Puedes añadir más campos si los necesitas en el token, pero mantenlo ligero
      },
      JWT_SECRET,
      { expiresIn: '1h' } // El token expirará en 1 hora
    );

    // 5. Respuesta exitosa con el token
    res.status(200).json({
      message: 'Inicio de sesión exitoso.',
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
    console.error('Excepción en loginUser:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};
