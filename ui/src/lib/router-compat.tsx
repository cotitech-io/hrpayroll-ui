/**
 * Thin compatibility layer so vendored components originally written for
 * `react-router-dom` v7 keep working under TanStack Router without a
 * mechanical rewrite of every call site.
 */
import type { ReactNode, AnchorHTMLAttributes } from "react";
import {
  Link as TanstackLink,
  Outlet,
  useRouterState,
} from "@tanstack/react-router";

export { Outlet };

export function useLocation() {
  return useRouterState({ select: (s) => s.location });
}

type NavClassName =
  | string
  | ((state: { isActive: boolean; isPending: boolean }) => string);

type BaseProps = Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "href" | "className"
>;

interface LinkProps extends BaseProps {
  to: string;
  className?: string;
  children?: ReactNode;
  replace?: boolean;
}

interface NavLinkProps extends Omit<BaseProps, "children"> {
  to: string;
  end?: boolean;
  className?: NavClassName;
  children?: ReactNode | ((state: { isActive: boolean }) => ReactNode);
}

export function Link({ to, ...rest }: LinkProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <TanstackLink to={to as any} {...(rest as any)} />;
}

function useIsActive(to: string, end: boolean) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (end) return pathname === to;
  return pathname === to || pathname.startsWith(to + "/");
}

export function NavLink({
  to,
  end = false,
  className,
  children,
  ...rest
}: NavLinkProps) {
  const isActive = useIsActive(to, end);
  const cls =
    typeof className === "function"
      ? className({ isActive, isPending: false })
      : className;
  const content = typeof children === "function" ? children({ isActive }) : children;
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <TanstackLink to={to as any} {...(rest as any)} className={cls}>
      {content}
    </TanstackLink>
  );
}
