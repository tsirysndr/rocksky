import { useParams } from "@tanstack/react-router";
import Dropbox from "./Dropbox";

function DropboxWithId() {
  const { id } = useParams({ strict: false });
  console.log(">> id", id);
  return <Dropbox fileId={id} />;
}

export default DropboxWithId;
