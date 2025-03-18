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
import { dropboxAtom } from "../../atoms/dropbox";
import Table from "../../components/Table";
import { AUDIO_EXTENSIONS } from "../../consts";
import useDropbox from "../../hooks/useDropbox";
import Main from "../../layouts/Main";
import { File } from "../../types/file";
import { AudioFile, Directory } from "./styles";

const columnHelper = createColumnHelper<File>();

export type DropboxProps = {
  fileId?: string;
};

const Dropbox = (props: DropboxProps) => {
  const [dropbox, setDropbox] = useAtom(dropboxAtom);
  const { getFiles, getFile } = useDropbox();
  const [loading, setLoading] = useState(true);
  const { pathname } = useLocation();

  const columns = [
    columnHelper.accessor("name", {
      header: "",
      size: 15,
      cell: (info) => (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
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
            <Directory to={`/dropbox/${info.row.original.id}`}>
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
    const fetchFiles = async () => {
      setLoading(true);
      const files = await getFiles(props.fileId);
      const cache = { ...dropbox?.cache };
      cache[props.fileId || "/Music"] = {
        files: files.entries.filter(
          (entry) =>
            entry[".tag"] === "folder" ||
            (entry[".tag"] === "file" &&
              AUDIO_EXTENSIONS.includes(entry.name.split(".").pop() || ""))
        ),
      };
      _.orderBy(files.entries, "name", "asc");
      let current_dir = "Music";
      let parent_dir;
      let parent_id;

      if (props.fileId) {
        const file = await getFile(props.fileId);
        current_dir = file.name;
        // extract the parent directory from the path
        const parent_path = file.path_display.split("/").slice(0, -1).join("/");
        parent_dir = file.path_display.split("/").slice(0, -1).pop();
        if (parent_path) {
          const parent = await getFile(parent_path);
          parent_id = parent.id;
        }
      }

      setDropbox({
        current_dir,
        parent_dir,
        parent_id,
        cache: {
          ...cache,
          [props.fileId || "/Music"]: {
            ...cache[props.fileId || "/Music"],
            current_dir,
            parent_dir,
            parent_id,
          },
        },
      });
      setLoading(false);
    };
    fetchFiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.fileId]);

  const parent_dir =
    dropbox?.cache[props.fileId || "/Music"]?.parent_dir || dropbox?.parent_dir;
  const current_dir =
    dropbox?.cache[props.fileId || "/Music"]?.current_dir ||
    dropbox?.current_dir;
  const parent_id =
    dropbox?.cache[props.fileId || "/Music"]?.parent_id || dropbox?.parent_id;
  return (
    <Main>
      {((props.fileId && dropbox?.cache[props.fileId]) ||
        !loading ||
        pathname === "/dropbox") && (
        <div
          style={{
            paddingTop: 80,
            position: "fixed",
            backgroundColor: "#fff",
            top: 19,
            width: 770,
          }}
        >
          <Breadcrumbs>
            {parent_dir && current_dir !== "Music" && (
              <Link
                to={
                  current_dir === "Music" ? `/dropbox` : `/dropbox/${parent_id}`
                }
                style={{ color: "#000" }}
              >
                {parent_dir}
              </Link>
            )}
          </Breadcrumbs>
          <HeadingMedium marginTop={"10px"} marginBottom={"25px"}>
            {current_dir === "Music" ? "Dropbox" : current_dir}
          </HeadingMedium>
        </div>
      )}

      <div style={{ marginTop: 100 }}>
        {loading && !dropbox?.cache[props.fileId || "/Music"] && (
          <ContentLoader
            width={700}
            height={350}
            viewBox="0 0 700 350"
            backgroundColor="#f5f5f5"
            foregroundColor="#dbdbdb"
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
        {(!loading || dropbox?.cache[props.fileId || "/Music"]) && (
          <Table
            columns={columns as any}
            files={
              dropbox?.cache[props.fileId || "/Music"]?.files.map((entry) => ({
                id: entry.id,
                name: entry.name,
                tag: entry[".tag"],
              })) || []
            }
          />
        )}
      </div>
    </Main>
  );
};

export default Dropbox;
