import { createContext, useContext } from "react";

/**
 * Modo impresión: los resultados lo leen para mostrar todo sin interacción
 * (todas las pestañas a la vez, secciones plegables abiertas, listas largas recortadas con un resumen).
 */
export const PrintMode = createContext(false);
export const usePrint = () => useContext(PrintMode);
