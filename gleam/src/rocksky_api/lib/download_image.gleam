import gleam/option.{type Option, None, Some}
import rocksky_api/error
import rocksky_api/node/axios
import rocksky_api/node/files
import rocksky_api/task

pub fn get_content_type(url: String) {
  axios.head(axios.global(), url, axios.default_options())
  |> task.attempt_result
  |> task.map(axios.header(_, "content-type"))
}

pub fn download_image(url: Option(String)) {
  case url {
    None | Some("") -> task.ok(None)
    Some(url) -> {
      use response <- task.then(
        axios.get(
          axios.global(),
          url,
          axios.Options(
            ..axios.default_options(),
            response_type: Some("arraybuffer"),
          ),
        )
        |> task.attempt_result,
      )
      files.from_bytes(response.data)
      |> error.map_js
      |> task.from_result
      |> task.map(Some)
    }
  }
}
