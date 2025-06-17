import { useParams } from "react-router";
import Dropbox from "./Dropbox";

function DropboxWithId() {
  const { id } = useParams<{ id: string }>();
  return <Dropbox fileId={id} />;
}

export default DropboxWithId;
