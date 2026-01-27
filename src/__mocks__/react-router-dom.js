// Manual mock for react-router-dom to avoid module resolution issues in Jest
import React from 'react';

export const BrowserRouter = ({ children }) => <div data-testid="browser-router">{children}</div>;
export const Routes = ({ children }) => <div data-testid="routes">{children}</div>;
export const Route = ({ path, element }) => <div data-testid={`route-${path}`}>{element}</div>;
export const NavLink = ({ to, children, className, ...props }) => (
  <a href={to} className={className} {...props} data-testid={`navlink-${to}`}>
    {children}
  </a>
);
export const Link = ({ to, children, ...props }) => (
  <a href={to} {...props} data-testid={`link-${to}`}>
    {children}
  </a>
);
export const useNavigate = () => jest.fn();
export const useParams = () => ({});
export const useLocation = () => ({ pathname: '/' });

