import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/components/Providers';

export const metadata: Metadata = {
  title: 'Samayak Admin Panel | Anugat AI',
  description: 'Academic operations management platform — manage departments, rooms, courses, faculty and analyse timetable utilisation.',
  keywords: ['samayak', 'admin', 'timetable', 'anugat', 'academic'],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
