import { Outlet } from "react-router";

import Footer from "../../components/layout/Footer.js";
import Header from "../../components/layout/Header.js";

export default function AppLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-background font-sans text-foreground">
      <a
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-primary focus:shadow-md"
        href="#main-content"
      >
        Skip to main content
      </a>

      <Header />

      <main
        className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 sm:py-5 lg:px-8"
        id="main-content"
        tabIndex={-1}
      >
        <Outlet />
      </main>

      <Footer />
    </div>
  );
}
