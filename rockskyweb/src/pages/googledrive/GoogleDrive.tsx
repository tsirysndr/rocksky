/* eslint-disable @typescript-eslint/no-explicit-any */
import { Folder2, MusicNoteBeamed } from "@styled-icons/bootstrap";
import { createColumnHelper } from "@tanstack/react-table";
import { Breadcrumbs } from "baseui/breadcrumbs";
import { HeadingMedium } from "baseui/typography";
import { useAtom } from "jotai";
import _ from "lodash";
import { useEffect, useState } from "react";
import ContentLoader from "react-content-loader";
import { Link, useLocation } from "react-router";
import googleDriveAtom from "../../atoms/googledrive";
import Table from "../../components/Table";
import { AUDIO_EXTENSIONS } from "../../consts";
import useGoogleDrive, {
  useFileQuery,
  useFilesQuery,
} from "../../hooks/useGoogleDrive";
import Main from "../../layouts/Main";
import { File } from "../../types/file";
import { AudioFile, Directory } from "./styles";

const columnHelper = createColumnHelper<File>();

export type GoogleDriveProps = {
  fileId?: string;
};

const GoogleDrive = (props: GoogleDriveProps) => {
  const [googleDrive, setGoogleDrive] = useAtom(googleDriveAtom);
  useFilesQuery();
  useFileQuery(props.fileId!);

  const { getFiles, getFile } = useGoogleDrive();
  const [loading, setLoading] = useState(true);
  const { pathname } = useLocation();

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
        <>
          {info.row.original.tag === "folder" && (
            <Directory to={`/googledrive/${info.row.original.id}`}>
              {info.row.original.name}
            </Directory>
          )}
          {info.row.original.tag === "file" && (
            <AudioFile>{info.row.original.name}</AudioFile>
          )}
        </>
      ),
    }),
  ];

  useEffect(() => {
    const fetchGoogleDrive = async () => {
      setLoading(true);
      const { files, authUrl } = await getFiles(props.fileId);

      if (authUrl) {
        window.location.href = authUrl;
        return;
      }

      const cache = { ...googleDrive?.cache };
      cache[props.fileId || "/Music"] = {
        files: files
          .filter(
            (x) =>
              x.mimeType.includes("folder") ||
              AUDIO_EXTENSIONS.includes(x.name.split(".").pop() || "")
          )
          .map((x) => ({
            id: x.id,
            name: x.name,
            mime_type: x.mimeType,
            parents: x.parents,
          })),
      };

      let current_dir = "Music";
      let parent_dir;
      let parent_id;
      if (props.fileId) {
        const current = await getFile(props.fileId);
        current_dir = current.name;
        parent_id = _.get(current, "parents.0");
        const parent = await getFile(_.get(current, "parents.0"));
        parent_dir = parent.name;
      }

      setGoogleDrive({
        current_dir,
        parent_dir,
        parent_id,
        cache: {
          ...cache,
          [props.fileId || "/Music"]: {
            parent_id,
            parent_dir,
            current_dir,
            ...cache[props.fileId || "/Music"],
          },
        },
      });
      setLoading(false);
    };
    fetchGoogleDrive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.fileId]);

  const parent_dir =
    googleDrive?.cache[props.fileId || "/Music"]?.parent_dir ||
    googleDrive?.parent_dir;
  const current_dir =
    googleDrive?.cache[props.fileId || "/Music"]?.current_dir ||
    googleDrive?.current_dir;
  const parent_id =
    googleDrive?.cache[props.fileId || "/Music"]?.parent_id ||
    googleDrive?.parent_id;
  return (
    <Main>
      {((props.fileId && googleDrive?.cache[props.fileId]) ||
        !loading ||
        pathname === "/googledrive") && (
        <div className="pt-[80px] fixed bg-[var(--color-background)] top-[19px] w-[770px]">
          <Breadcrumbs>
            {parent_dir && current_dir !== "Music" && (
              <Link
                to={
                  current_dir === "Music"
                    ? `/googledrive`
                    : `/googledrive/${parent_id}`
                }
                className="!text-[var(--color-text)]"
              >
                {parent_dir}
              </Link>
            )}
          </Breadcrumbs>
          <HeadingMedium
            marginTop={"10px"}
            marginBottom={"25px"}
            className="!text-[var(--color-text)]"
          >
            {current_dir === "Music" ? "Google Drive" : current_dir}
          </HeadingMedium>
        </div>
      )}

      <div className="mt-[100px] overflow-x-hidden mb-[140px]">
        {loading && !googleDrive?.cache[props.fileId || "/Music"]?.files && (
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
        {(!loading || googleDrive?.cache[props.fileId || "/Music"]?.files) && (
          <Table
            columns={columns as any}
            files={
              googleDrive?.cache[props.fileId || "/Music"]?.files.map(
                (entry) => ({
                  id: entry.id,
                  name: entry.name,
                  tag: entry.mime_type.includes("folder") ? "folder" : "file",
                })
              ) || []
            }
          />
        )}
      </div>
    </Main>
  );
};

export default GoogleDrive;
