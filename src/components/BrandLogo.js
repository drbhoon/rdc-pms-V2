/**
 * BrandLogo — small, mobile-friendly RDC company logo badge.
 *
 * The source image (public/rdc-logo.jpg) has a light background, so it sits in
 * a white rounded chip to look clean on the dark/coloured headers used across
 * the app. Default height ~24px keeps it compact on phones.
 */
import { withBase } from '../lib/basePath';

export default function BrandLogo({ className = '', imgClassName = 'h-6' }) {
  return (
    <span className={`inline-flex items-center rounded-md bg-white px-1.5 py-1 shadow-sm shrink-0 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {/* withBase: Next rewrites <Link> and router.push() for basePath but not
          plain <img src>, so this would 404 when mounted at hr.rdcc.ai/parakh. */}
      <img src={withBase('/rdc-logo.jpg')} alt="RDC Concrete (India) Ltd" className={`${imgClassName} w-auto`} />
    </span>
  );
}
