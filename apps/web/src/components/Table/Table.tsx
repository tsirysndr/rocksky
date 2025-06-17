import styled from "@emotion/styled";
import {
  AccessorKeyColumnDefBase,
  flexRender,
  getCoreRowModel,
  IdIdentifier,
  useReactTable,
} from "@tanstack/react-table";
import { FC, useEffect, useState } from "react";
import { File } from "../../types/file";

const TableRow = styled.tr`
  height: 48px;
  color: var(--color-text) !important;
  &:hover {
    background-color: var(--color-menu-hover);
  }
`;

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
    <table className="mt-[0px] w-full">
      <thead>
        {table.getHeaderGroups().map((headerGroup) => (
          <tr
            key={headerGroup.id}
            className="h-[36px] text-[var(--color-text)]"
          >
            {headerGroup.headers.map((header) => (
              <th key={header.id} className="text-left">
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
          <TableRow key={row.id}>
            {row.getVisibleCells().map((cell) => (
              <td
                key={cell.id}
                className="overflow-hidden !text-[var(--color-text)]"
              >
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </td>
            ))}
          </TableRow>
        ))}
      </tbody>
    </table>
  );
};

export default Table;
