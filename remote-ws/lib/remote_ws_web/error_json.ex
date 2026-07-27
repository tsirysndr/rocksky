defmodule RemoteWsWeb.ErrorJSON do
  # Minimal error renderer referenced by the endpoint's :render_errors config.
  def render(template, _assigns) do
    %{errors: %{detail: Phoenix.Controller.status_message_from_template(template)}}
  end
end
