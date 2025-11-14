import React from "react";

export interface DataTableColumn<T> {
  key: string;
  header: string;
  accessor?: (row: T) => React.ReactNode;
  className?: string;
}

export interface DataTableProps<T> {
  data: T[];
  columns: DataTableColumn<T>[];
  getRowId: (row: T, index: number) => React.Key;
  isLoading?: boolean;
  emptyState?: React.ReactNode;
}

function DataTable<T>({ data, columns, getRowId, isLoading = false, emptyState }: DataTableProps<T>) {
  if (isLoading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center rounded-2xl border border-[#1f1f25] bg-[#0f0f16] text-gray-300">
        <div className="flex items-center gap-3 text-sm">
          <span className="h-4 w-4 animate-spin rounded-full border border-[#1f1f25] border-t-[#f6c800]" />
          Loading...
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[#1f1f25] bg-[#0f0f16] p-10 text-center text-sm text-gray-500">
        {emptyState || "No records yet."}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[#1f1f25] bg-[#0f0f16]">
      <table className="min-w-full divide-y divide-[#1f1f25] text-left text-sm text-gray-200">
        <thead className="bg-[#11111a] text-xs uppercase tracking-[0.28em] text-gray-500">
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col" className={`px-5 py-4 font-medium ${column.className || ""}`}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#161621]">
          {data.map((row, index) => (
            <tr key={getRowId(row, index)} className="hover:bg-[#11111a]">
              {columns.map((column) => (
                <td key={column.key} className={`px-5 py-4 align-middle ${column.className || ""}`}>
                  {column.accessor ? column.accessor(row) : (row as any)[column.key] ?? "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default DataTable;
