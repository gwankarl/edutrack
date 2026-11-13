import { createBrowserRouter } from "react-router";

import AppLayout from "../layouts/AppLayout.js";
import HomePage from "./HomePage.js";
import NotFoundPage from "./NotFoundPage.js";

export const router = createBrowserRouter([
  {
    Component: AppLayout,
    children: [
      {
        index: true,
        Component: HomePage,
      },
      {
        path: "*",
        Component: NotFoundPage,
      },
    ],
  },
]);
