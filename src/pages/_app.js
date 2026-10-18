import localFont from 'next/font/local';
import '../styles/globals.css';
import { installFetchBasePath } from '../lib/basePath';

// Runs once, before any component fetches, so app-absolute "/api/..." calls
// resolve correctly when PARAKH is mounted under /parakh. No-op at root.
installFetchBasePath();

// The LMS's font, bundled rather than fetched, so nothing is loaded from a
// third-party site and it works behind the office network. Tailwind's `sans`
// reads it through --font-inter.
const inter = localFont({
  src: '../fonts/inter-latin-wght-normal.woff2',
  weight: '100 900',
  display: 'swap',
});

export default function App({ Component, pageProps }) {
  return (
    <>
      <style jsx global>{`
        :root { --font-inter: ${inter.style.fontFamily}; }
      `}</style>
      <Component {...pageProps} />
    </>
  );
}
