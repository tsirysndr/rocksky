/* eslint-disable @typescript-eslint/no-explicit-any */
import { Folder2, MusicNoteBeamed } from "@styled-icons/bootstrap";
import { Link } from "@tanstack/react-router";
import { createColumnHelper } from "@tanstack/react-table";
import { Breadcrumbs } from "baseui/breadcrumbs";
import { HeadingMedium } from "baseui/typography";
import ContentLoader from "react-content-loader";
import ContextMenu from "../../components/ContextMenu";
import Table from "../../components/Table";
import { useFilesQuery } from "../../hooks/useGoogleDrive";
import Main from "../../layouts/Main";
import { File } from "../../types/file";
import { AudioFile, Directory } from "./styles";

const columnHelper = createColumnHelper<File>();

export type GoogleDriveProps = {
  fileId?: string;
};

const GoogleDrive = (props: GoogleDriveProps) => {
  const { data, isLoading } = useFilesQuery(props.fileId);

  const columns = [
    columnHelper.accessor("name", {
      header: "",
      size: 15,
      cell: (info) => (
        <div className="flex items-center justify-center">
          {info.row.original.tag == "folder" && (
            <div>
              <Folder2 size={25} />
            </div>
          )}
          {info.row.original.tag !== "folder" && (
            <div>
              <MusicNoteBeamed size={25} />
            </div>
          )}
        </div>
      ),
    }),
    columnHelper.accessor("name", {
      header: "",
      cell: (info) => (
        <div>
          {info.row.original.tag === "folder" && (
            <Directory to={`/googledrive/${info.row.original.id}`}>
              {info.row.original.name}
            </Directory>
          )}
          {info.row.original.tag === "file" && (
            <AudioFile>{info.row.original.name}</AudioFile>
          )}
        </div>
      ),
    }),
    columnHelper.accessor("name", {
      header: "",
      cell: (info) => (
        <ContextMenu
          file={{
            id: info.row.original.id,
            name: info.row.original.name,
            type: info.row.original.tag,
          }}
        />
      ),
    }),
  ];

  return (
    <Main>
      <div className="pt-[80px] fixed bg-[var(--color-background)] top-[19px] w-[770px]">
        <Breadcrumbs>
          {
            <Link
              to={
                data?.parentDirectory?.path === "/Music"
                  ? `/googledrive`
                  : `/googledrive/$id`
              }
              params={{ id: data?.parentDirectory?.fileId || "" }}
              className="!text-[var(--color-text)]"
            >
              {data?.parentDirectory?.path === "/Music"
                ? "Google Drive"
                : data?.parentDirectory?.name}
            </Link>
          }
        </Breadcrumbs>
        <HeadingMedium
          marginTop={"10px"}
          marginBottom={"25px"}
          className="!text-[var(--color-text)]"
        >
          {data?.directory?.path === "/Music"
            ? "Google Drive"
            : data?.directory?.name}
        </HeadingMedium>
      </div>

      <div className="mt-[100px] overflow-x-hidden mb-[140px]">
        {isLoading && (
          <ContentLoader
            width={700}
            height={350}
            viewBox="0 0 700 350"
            backgroundColor="var(--color-skeleton-background)"
            foregroundColor="var(--color-skeleton-foreground)"
            {...props}
          >
            <rect x="66" y="52" rx="6" ry="6" width="483" height="15" />
            <circle cx="20" cy="60" r="15" />
            <rect x="66" y="105" rx="6" ry="6" width="420" height="15" />
            <circle cx="20" cy="113" r="15" />
            <rect x="66" y="158" rx="6" ry="6" width="483" height="15" />
            <circle cx="20" cy="166" r="15" />
            <rect x="66" y="211" rx="6" ry="6" width="444" height="15" />
            <circle cx="20" cy="219" r="15" />
            <rect x="66" y="263" rx="6" ry="6" width="483" height="15" />
            <circle cx="20" cy="271" r="15" />
          </ContentLoader>
        )}
        {!isLoading && (
          <Table
            columns={columns as any}
            files={[
              ...data!.directories.map((dir) => ({
                id: dir.fileId,
                name: dir.name,
                tag: "folder",
              })),
              ...data!.files.map((file) => ({
                id: file.fileId,
                name: file.name,
                tag: "file",
              })),
            ]}
          />
        )}
      </div>
    </Main>
  );
};

export default GoogleDrive;
