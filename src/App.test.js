import { render, screen } from "@testing-library/react";
import Login from "./pages/Login";

test("renders login screen title", () => {
  render(<Login />);
  expect(screen.getByText(/couple meals/i)).toBeInTheDocument();
});
