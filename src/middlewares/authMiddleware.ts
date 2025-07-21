import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// Extendemos la interfaz Request de Express para añadir la propiedad 'user'
// Esto nos permite adjuntar la información del usuario decodificada del JWT
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        email: string;
        username: string;
        // Puedes añadir más propiedades si las incluyes en el payload de tu JWT
      };
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET;

export const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
  // 1. Obtener el encabezado de autorización
  const authHeader = req.headers['authorization'];
  // El token generalmente viene como "Bearer TOKEN_AQUI"
  const token = authHeader && authHeader.split(' ')[1];

  // 2. Verificar si no hay token
  if (token == null) {
    return res.status(401).json({ error: 'Acceso denegado. No se proporcionó token.' });
  }

  // 3. Verificar si JWT_SECRET está definido
  if (!JWT_SECRET) {
    console.error('JWT_SECRET no está definido en el entorno.');
    return res.status(500).json({ error: 'Error de configuración del servidor.' });
  }

  // 4. Verificar el token
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      // Si el token no es válido (expirado, mal firmado, etc.)
      console.error('Error al verificar token:', err.message);
      return res.status(403).json({ error: 'Token inválido o expirado.' });
    }

    // Si el token es válido, adjuntamos la información del usuario a la solicitud
    // para que los controladores posteriores puedan acceder a ella.
    req.user = user as Request['user'];
    next(); // Continuar con la siguiente función middleware o controlador de ruta
  });
};
