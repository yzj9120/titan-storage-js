const CopyWebpackPlugin = require('copy-webpack-plugin');
const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const TerserPlugin = require("terser-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const CssMinimizerPlugin = require("css-minimizer-webpack-plugin");
const CompressionPlugin = require("compression-webpack-plugin");
const fs = require("fs");

function generateHtmlPlugins() {
  const modulesDir = path.resolve(__dirname, "src"); 
  const htmlFiles = fs
    .readdirSync(modulesDir)
    .filter((file) => file.endsWith(".html"));

  return htmlFiles.map((file) => {
    return new HtmlWebpackPlugin({
      template: path.join(modulesDir, file),
      filename: file, 
      inject: "body", 
    });
  });
}

module.exports = {
  entry: {
    TitanStorage: "./src/js/titanStorage.js",
  },

  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "[name].js", 
    library: "TitanStorage",
    libraryTarget: "umd", 
    libraryExport: "default",
    globalObject: "this", 
  },

  module: {
    rules: [
      {
        test: /\.js$/, 
        exclude: /node_modules/,
        use: {
          loader: "babel-loader",
          options: {
            presets: ["@babel/preset-env"],
          },
        },
      },
      {
        test: /\.css$/, 
        use: [MiniCssExtractPlugin.loader, "css-loader"],
      },
    ],
  },

  plugins: [
    ...generateHtmlPlugins(),
    new MiniCssExtractPlugin({
      filename: "assets/css/[name].css",
    }),
    new CompressionPlugin({
      algorithm: "gzip",
      test: /\.js(\?.*)?$/i, 
      threshold: 10240,
      minRatio: 0.8,
    }),
    new CopyWebpackPlugin({
      patterns: [
        { from: 'LICENSE.txt', to: 'LICENSE.txt' },  // 将 LICENSE.txt 文件复制到 dist 目录
      ],
    }),
  ],

  mode: "production",
  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin(),
      new CssMinimizerPlugin(),
    ],
  },

  performance: {
    hints: "warning",
    maxAssetSize: 1500000,
    maxEntrypointSize: 1500000,
  },

  devServer: {
    static: {
      directory: path.join(__dirname, "dist"),
    },
    port: 9000,
    open: true,
    hot: true,
    compress: true,
    proxy: [
      {
        context: ['/apis'],
        target: 'https://api-test1.container1.titannet.io',
        changeOrigin: true,
        secure: false,
        pathRewrite: { '^/apis': '' },
      },
    ],
  },
};
