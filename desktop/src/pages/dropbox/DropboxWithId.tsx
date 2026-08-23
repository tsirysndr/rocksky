import { useParams } from "@tanstack/react-router";
import Dropbox from "./Dropbox";

function DropboxWithId() {
  const { id } = useParams({ from: "/dropbox/$id" });
  return <Dropbox fileId={id} />;
}

export default DropboxWithId;
