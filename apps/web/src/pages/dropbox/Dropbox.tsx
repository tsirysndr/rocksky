/* eslint-disable @typescript-eslint/no-explicit-any */
import { Folder2, MusicNoteBeamed } from "@styled-icons/bootstrap";
import { Link, useRouter } from "@tanstack/react-router";
import { createColumnHelper } from "@tanstack/react-table";
import { Breadcrumbs } from "baseui/breadcrumbs";
import { HeadingMedium } from "baseui/typography";
import { useAtom } from "jotai";
import _ from "lodash";
import { useEffect, useState } from "react";
import ContentLoader from "react-content-loader";
import { dropboxAtom } from "../../atoms/dropbox";
import Table from "../../components/Table";
import { AUDIO_EXTENSIONS } from "../../consts";
import useDropbox, {
  useFileQuery,
  useFilesQuery,
  useTemporaryLinkQuery,
} from "../../hooks/useDropbox";
import Main from "../../layouts/Main";
import Metadata from "../../lib/metadata";
import { File } from "../../types/file";
import { AudioFile, Directory } from "./styles";

const columnHelper = createColumnHelper<File>();

export type DropboxProps = {
  fileId?: string;
};

const Dropbox = (props: DropboxProps) => {
  const [dropbox, setDropbox] = useAtom(dropboxAtom);
  useFilesQuery();
  useFileQuery(props.fileId!);
  useTemporaryLinkQuery(props.fileId!);

  const { getFiles, getFile, getTemporaryLink } = useDropbox();
  const [loading, setLoading] = useState(true);
  const {
    state: {
      location: { pathname },
    },
  } = useRouter();

  const playFile = async (id: string) => {
    const { link } = await getTemporaryLink(id);
    console.log(">> Playing file:", link);
    const m = new Metadata();
    await m.load(link);
    console.log(">> Metadata:", m.get_metadata());
  };

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
            <Directory to={`/dropbox/${info.row.original.id}`}>
              {info.row.original.name}
            </Directory>
          )}
          {info.row.original.tag === "file" && (
            <AudioFile onClick={() => playFile(info.row.original.id)}>
              {info.row.original.name}
            </AudioFile>
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
        <div className="pt-[80px] fixed bg-[var(--color-background)] top-[19px] w-[770px]">
          <Breadcrumbs>
            {parent_dir && current_dir !== "Music" && (
              <Link
                to={current_dir === "Music" ? `/dropbox` : `/dropbox/$id`}
                params={{ id: parent_id! }}
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
            {current_dir === "Music" ? "Dropbox" : current_dir}
          </HeadingMedium>
        </div>
      )}

      <div className="mt-[100px] overflow-x-hidden mb-[140px] ">
        {loading && !dropbox?.cache[props.fileId || "/Music"] && (
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
