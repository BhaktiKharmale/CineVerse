import { useOutletContext } from "react-router-dom";
import type { AdminLayoutContextValue } from "../DashboardLayout";

export function useAdminLayout(): AdminLayoutContextValue {
  return useOutletContext<AdminLayoutContextValue>();
}
