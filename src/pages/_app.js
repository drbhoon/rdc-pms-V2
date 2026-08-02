import '../styles/globals.css';
import { installFetchBasePath } from '../lib/basePath';

// Runs once, before any component fetches, so app-absolute "/api/..." calls
// resolve correctly when PARAKH is mounted under /parakh. No-op at root.
installFetchBasePath();

export default function App({ Component, pageProps }) {
  return <Component {...pageProps} />;
}
