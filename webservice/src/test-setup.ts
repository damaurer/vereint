import de from './app/i18n/locales/de.json';
import { preloadLanguage } from './app/i18n/i18n.service';

// Komponenten-Tests laufen ohne App-Initializer: Deutsch vorab bereitstellen.
preloadLanguage('de', de);
