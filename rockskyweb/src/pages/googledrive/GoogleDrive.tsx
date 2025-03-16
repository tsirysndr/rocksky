/* eslint-disable @typescript-eslint/no-explicit-any */
import { Folder2, MusicNoteBeamed } from "@styled-icons/bootstrap";
import { createColumnHelper } from "@tanstack/react-table";
import { HeadingMedium } from "baseui/typography";
import { useAtom } from "jotai";
import _ from "lodash";
import { useEffect, useState } from "react";
import ContentLoader from "react-content-loader";
import { useNavigate } from "react-router";
import googleDriveAtom from "../../atoms/googledrive";
import ArrowBack from "../../components/Icons/ArrowBack";
import Table from "../../components/Table";
import { AUDIO_EXTENSIONS } from "../../consts";
import useGoogleDrive from "../../hooks/useGoogleDrive";
import Main from "../../layouts/Main";
import { File } from "../../types/file";
import { AudioFile, BackButton, Directory } from "./styles";

const columnHelper = createColumnHelper<File>();

export type GoogleDriveProps = {
  fileId?: string;
};

const GoogleDrive = (props: GoogleDriveProps) => {
  const [googleDrive, setGoogleDrive] = useAtom(googleDriveAtom);
  const { getFiles } = useGoogleDrive();
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
      const { files } = await getFiles(props.fileId);
      const cache = { ...googleDrive?.cache };
      cache[props.fileId || "/Music"] = files
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
        }));
      setGoogleDrive({
        current_folder: _.get(files, "0.parents.0"),
        cache,
      });
      setLoading(false);
    };
    fetchGoogleDrive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.fileId]);

  return (
    <Main>
      <HeadingMedium marginTop={"50px"} marginBottom={"0px"}>
        Google Drive
      </HeadingMedium>
      {props.fileId && (
        <BackButton onClick={() => navigate(-1)}>
          <ArrowBack />
        </BackButton>
      )}
      {loading && !googleDrive?.cache[props.fileId || "/Music"] && (
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
      {(!loading || googleDrive?.cache[props.fileId || "/Music"]) && (
        <Table
          columns={columns as any}
          files={
            googleDrive?.cache[props.fileId || "/Music"]?.map((entry) => ({
              id: entry.id,
              name: entry.name,
              tag: entry.mime_type.includes("folder") ? "folder" : "file",
            })) || []
          }
        />
      )}
    </Main>
  );
};

export default GoogleDrive;
