/* eslint-disable @typescript-eslint/no-explicit-any */
import { Folder2, MusicNoteBeamed } from "@styled-icons/bootstrap";
import { createColumnHelper } from "@tanstack/react-table";
import { HeadingMedium } from "baseui/typography";
import { useAtom } from "jotai";
import _ from "lodash";
import { useEffect, useState } from "react";
import ContentLoader from "react-content-loader";
import { useNavigate } from "react-router";
import { dropboxAtom } from "../../atoms/dropbox";
import ArrowBack from "../../components/Icons/ArrowBack";
import Table from "../../components/Table";
import { AUDIO_EXTENSIONS } from "../../consts";
import useDropbox from "../../hooks/useDropbox";
import Main from "../../layouts/Main";
import { File } from "../../types/file";
import { AudioFile, BackButton, Directory } from "./styles";

const columnHelper = createColumnHelper<File>();

export type DropboxProps = {
  fileId?: string;
};

const Dropbox = (props: DropboxProps) => {
  const [dropbox, setDropbox] = useAtom(dropboxAtom);
  const { getFiles } = useDropbox();
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

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
      cache[props.fileId || "/Music"] = files.entries.filter(
        (entry) =>
          entry[".tag"] === "folder" ||
          (entry[".tag"] === "file" &&
            AUDIO_EXTENSIONS.includes(entry.name.split(".").pop() || ""))
      );
      _.orderBy(files.entries, "name", "asc");
      setDropbox({
        current_path: props.fileId || "/Music",
        cache,
      });
      setLoading(false);
    };
    fetchFiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.fileId]);

  return (
    <Main>
      <HeadingMedium marginTop={"50px"} marginBottom={"0px"}>
        Dropbox
      </HeadingMedium>
      {props.fileId && (
        <BackButton onClick={() => navigate(-1)}>
          <ArrowBack />
        </BackButton>
      )}
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
            dropbox?.cache[props.fileId || "/Music"]?.map((entry) => ({
              id: entry.id,
              name: entry.name,
              tag: entry[".tag"],
            })) || []
          }
        />
      )}
    </Main>
  );
};

export default Dropbox;
