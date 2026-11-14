defmodule Check.MixProject do
  use Mix.Project

  # A one-test project shaped like the track's exercises, run by the self-test.
  def project do
    [app: :check, version: "0.1.0", start_permanent: false, deps: []]
  end

  def application do
    [extra_applications: [:logger]]
  end
end
