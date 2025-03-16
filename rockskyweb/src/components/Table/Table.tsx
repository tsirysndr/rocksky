import {
  AccessorKeyColumnDefBase,
  flexRender,
  getCoreRowModel,
  IdIdentifier,
  useReactTable,
} from "@tanstack/react-table";
import { FC, useEffect, useState } from "react";
import { File } from "../../types/file";

export type TableProps = {
  columns: (AccessorKeyColumnDefBase<File, string | undefined> &
    Partial<IdIdentifier<File, string | undefined>>)[];
  files: File[];
};

const Table: FC<TableProps> = ({ columns, files }) => {
  const [data, setData] = useState<File[]>(() => [...files]);

  useEffect(() => {
    setData([...files]);
  }, [files]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <table style={{ width: "100%", marginTop: 0 }}>
      <thead>
        {table.getHeaderGroups().map((headerGroup) => (
          <tr
            key={headerGroup.id}
            style={{ height: 36, color: "rgba(0, 0, 0, 0.54)" }}
          >
            {headerGroup.headers.map((header) => (
              <th key={header.id} style={{ textAlign: "left" }}>
                {header.isPlaceholder
                  ? null
                  : flexRender(
                      header.column.columnDef.header,
                      header.getContext()
                    )}
              </th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody>
        {table.getRowModel().rows.map((row) => (
          <tr key={row.id} style={{ height: 48 }}>
            {row.getVisibleCells().map((cell) => (
              <td
                key={cell.id}
                style={{
                  overflow: "hidden",
                }}
              >
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default Table;
