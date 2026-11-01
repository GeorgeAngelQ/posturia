import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "posturaia.theme";

/**
 * Script inline que corre ANTES del primer pintado (se inyecta en <head>, ver
 * `__root.tsx`) para aplicar la clase `.dark` según lo guardado o la preferencia
 * del sistema, y así evitar el parpadeo de tema claro → oscuro al recargar.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}var d=document.documentElement;if(t==='dark'){d.classList.add('dark')}else{d.classList.remove('dark')}d.style.colorScheme=t}catch(e){}})();`;

type ThemeValue = { theme: Theme; setTheme: (t: Theme) => void; toggleTheme: () => void };

const ThemeContext = createContext<ThemeValue>({
  theme: "light",
  setTheme: () => {},
  toggleTheme: () => {},
});

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");

  // El script de <head> ya dejó la clase correcta en <html>; solo sincronizamos el estado de React.
  useEffect(() => {
    setThemeState(document.documentElement.classList.contains("dark") ? "dark" : "light");
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    applyTheme(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* almacenamiento no disponible: el tema solo dura la sesión */
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(document.documentElement.classList.contains("dark") ? "light" : "dark");
  }, [setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
