# frozen_string_literal: true

# Standalone — no native core involved. Loads on its own via
# `require "rocksky/filter"`.
module Rocksky
  # Fluent builder for RSQL filter expressions, accepted by the +filter:+
  # parameter of the catalog and scrobble-feed queries
  # (app.rocksky.song.getSongs, app.rocksky.artist.getArtists,
  # app.rocksky.album.getAlbums, app.rocksky.scrobble.getScrobbles).
  #
  #     require "rocksky"
  #
  #     filter = Rocksky::Filter.eq(:artist, "Daft Punk")
  #                             .and(Rocksky::Filter.gt(:duration, 200_000))
  #                             .or(Rocksky::Filter.is_in(:genre, %w[house electro]))
  #
  #     Rocksky.catalog_songs(filter: filter)
  #     # artist=="Daft Punk";duration=gt=200000,genre=in=(house,electro)
  #
  # Fields are Symbols (Strings work too); dotted selectors on the scrobble
  # feed are written as +:"track.artist"+. String values are quoted and
  # escaped automatically when they contain characters RSQL reserves; +*+
  # wildcards pass through unquoted so <tt>Filter.eq(:artist, "Daft*")</tt>
  # performs a case-insensitive match.
  class Filter
    # Characters that never need quoting in an RSQL value (+*+ kept bare so
    # wildcards work).
    SAFE_VALUE = /\A[A-Za-z0-9_.:@*+-]+\z/
    private_constant :SAFE_VALUE

    class << self
      # +field==value+ — equals; +*+ in string values is a wildcard.
      def eq(field, value)
        comparison(field, "==", value)
      end

      # +field!=value+ — not equals.
      def ne(field, value)
        comparison(field, "!=", value)
      end

      # +field=gt=value+ — greater than.
      def gt(field, value)
        comparison(field, "=gt=", value)
      end

      # +field=ge=value+ — greater than or equal.
      def ge(field, value)
        comparison(field, "=ge=", value)
      end

      # +field=lt=value+ — less than.
      def lt(field, value)
        comparison(field, "=lt=", value)
      end

      # +field=le=value+ — less than or equal.
      def le(field, value)
        comparison(field, "=le=", value)
      end

      # +field=in=(a,b)+ — matches any of the values.
      def is_in(field, values)
        list(field, "=in=", values)
      end

      # +field=out=(a,b)+ — matches none of the values.
      def is_out(field, values)
        list(field, "=out=", values)
      end

      alias in is_in
      alias out is_out

      # +field==null+ — the field is NULL.
      def is_null(field)
        new("#{field}==null", :comparison)
      end

      # +field!=null+ — the field is not NULL.
      def is_not_null(field)
        new("#{field}!=null", :comparison)
      end

      private

      def comparison(field, op, value)
        new("#{field}#{op}#{render_value(value)}", :comparison)
      end

      def list(field, op, values)
        name = op == "=in=" ? "is_in" : "is_out"
        raise ArgumentError, "Filter.#{name}(#{field.inspect}, ...) needs at least one value" if values.empty?

        new("#{field}#{op}(#{values.map { |v| render_value(v) }.join(",")})", :comparison)
      end

      def render_value(value)
        return value.to_s if value.is_a?(Integer) || value.is_a?(Float) ||
                             value == true || value == false

        str = value.to_s
        return str if !str.empty? && SAFE_VALUE.match?(str)

        %("#{str.gsub(/(["\\])/) { "\\#{Regexp.last_match(1)}" }}")
      end
    end

    def initialize(expr, kind)
      @expr = expr
      @kind = kind
    end

    # Both sides must match (+;+). An +or+ operand is parenthesized to keep
    # RSQL precedence.
    def and(other)
      Filter.new("#{operand_in_and};#{other.operand_in_and}", :and)
    end

    # Either side may match (+,+). Never parenthesizes.
    def or(other)
      Filter.new("#{@expr},#{other.build}", :or)
    end

    # The RSQL expression string to send as the +filter+ query param.
    def build
      @expr
    end

    alias to_s build

    protected

    def operand_in_and
      @kind == :or ? "(#{@expr})" : @expr
    end
  end
end
