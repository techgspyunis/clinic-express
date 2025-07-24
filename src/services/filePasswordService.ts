import { SupabaseClient } from '@supabase/supabase-js';

// Define la interfaz para la estructura de la tabla filepassword
interface FilePassword {
  filep_id: string;
  password: string;
  is_active: boolean;
}

/**
 * Servicio para interactuar con la tabla de contraseñas de archivos.
 */
export const FilePasswordService = {
  /**
   * Obtiene todas las contraseñas activas de la base de datos.
   * @param supabase Cliente de Supabase.
   * @returns Un array de strings con las contraseñas activas.
   */
  getAllActivePasswords: async (supabase: SupabaseClient): Promise<string[]> => {
    try {
      const { data, error } = await supabase
        .from('filepassword')
        .select('password')
        .eq('is_active', true); // Solo obtenemos contraseñas activas

      if (error) {
        console.error('Error al obtener contraseñas de la base de datos:', error);
        return [];
      }

      // Mapeamos los datos para devolver solo un array de strings
      return data.map((row: Partial<FilePassword>) => row.password || '');
    } catch (err) {
      console.error('Excepción en FilePasswordService.getAllActivePasswords:', err);
      return [];
    }
  },
};
