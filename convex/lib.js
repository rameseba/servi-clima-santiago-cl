/**
 * Normaliza un número de certificado para la BÚSQUEDA.
 *
 * El número impreso en el documento puede llevar guiones, espacios o puntos
 * ("77689-2", "77689 2", "77.689.2") mientras que el guardado puede no
 * llevarlos (el nombre del archivo suele perderlos). Al comparar sólo letras
 * y dígitos en mayúscula, todas esas variantes resuelven al mismo certificado.
 */
export function normalizarNumero(numero) {
  return String(numero ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}
