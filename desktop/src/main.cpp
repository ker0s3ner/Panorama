#include <QApplication>
#include <QDialog>
#include <QFormLayout>
#include <QHBoxLayout>
#include <QLabel>
#include <QLineEdit>
#include <QMainWindow>
#include <QMessageBox>
#include <QPushButton>
#include <QSettings>
#include <QUrl>
#include <QVBoxLayout>
#include <QWebEnginePage>
#include <QWebEngineView>
#include <QDesktopServices>

namespace {
const QString defaultServer = QStringLiteral("http://127.0.0.1:4173");

QString cleanServerUrl(QString value) {
  value = value.trimmed();
  while (value.endsWith('/')) value.chop(1);
  return value;
}

bool validServerUrl(const QString &value) {
  const QUrl url(value);
  return url.isValid() && (url.scheme() == "http" || url.scheme() == "https") && !url.host().isEmpty();
}

class FirstSetup final : public QDialog {
 public:
  explicit FirstSetup(QSettings &settings, QWidget *parent = nullptr) : QDialog(parent), settings_(settings) {
    setWindowTitle(QStringLiteral("Welcome to Panorama"));
    setMinimumWidth(520);
    auto *layout = new QVBoxLayout(this);
    auto *brand = new QLabel(QStringLiteral("PANORAMA"));
    brand->setObjectName("brand");
    layout->addWidget(brand);
    auto *heading = new QLabel(QStringLiteral("Set up your workspace"));
    heading->setObjectName("heading");
    layout->addWidget(heading);
    auto *description = new QLabel(QStringLiteral("Connect this desktop app to your Panorama server. Your map, data layers and provider settings will open in a private desktop window."));
    description->setWordWrap(true);
    description->setObjectName("muted");
    layout->addWidget(description);
    auto *form = new QFormLayout;
    server_ = new QLineEdit(settings_.value("server/url", defaultServer).toString());
    server_->setPlaceholderText(defaultServer);
    form->addRow(QStringLiteral("Panorama server"), server_);
    layout->addLayout(form);
    auto *hint = new QLabel(QStringLiteral("Default for local development: http://127.0.0.1:4173"));
    hint->setObjectName("muted");
    layout->addWidget(hint);
    auto *buttons = new QHBoxLayout;
    buttons->addStretch();
    auto *continueButton = new QPushButton(QStringLiteral("Open Panorama"));
    continueButton->setObjectName("primary");
    buttons->addWidget(continueButton);
    layout->addLayout(buttons);
    connect(continueButton, &QPushButton::clicked, this, [this]() {
      const auto url = cleanServerUrl(server_->text());
      if (!validServerUrl(url)) {
        QMessageBox::warning(this, QStringLiteral("Check server address"), QStringLiteral("Enter a valid Panorama server URL beginning with http:// or https://."));
        return;
      }
      settings_.setValue("server/url", url);
      settings_.setValue("setup/complete", true);
      accept();
    });
  }
  QString serverUrl() const { return cleanServerUrl(server_->text()); }

 private:
  QSettings &settings_;
  QLineEdit *server_{};
};

class PanoramaPage final : public QWebEnginePage {
 public:
  explicit PanoramaPage(QObject *parent = nullptr) : QWebEnginePage(parent) {
    connect(this, &QWebEnginePage::newWindowRequested, this, [](QWebEngineNewWindowRequest &request) {
      QDesktopServices::openUrl(request.requestedUrl());
    });
  }
};
} // namespace

int main(int argc, char *argv[]) {
  QApplication app(argc, argv);
  QCoreApplication::setOrganizationName(QStringLiteral("Panorama"));
  QCoreApplication::setApplicationName(QStringLiteral("Panorama"));
  app.setStyleSheet(R"(
    QWidget { background: #171a1d; color: #e6e9ec; font-family: "Inter", "Segoe UI", sans-serif; font-size: 13px; }
    QDialog { background: #171a1d; }
    QLabel#brand { color: #69a8ff; font-size: 12px; font-weight: 700; letter-spacing: 4px; }
    QLabel#heading { font-size: 25px; font-weight: 600; padding-top: 8px; }
    QLabel#muted { color: #9ba5af; }
    QLineEdit { background: #20252a; border: 1px solid #39424b; padding: 10px; selection-background-color: #3678c9; }
    QPushButton { background: #252b31; border: 1px solid #3b454f; padding: 9px 16px; }
    QPushButton:hover { border-color: #69a8ff; }
    QPushButton#primary { background: #2869b2; border-color: #4388d2; font-weight: 600; }
    QMainWindow { background: #111416; }
    QWidget#toolbar { background: #1b2024; border-bottom: 1px solid #343b42; }
  )");

  QSettings settings;
  QString serverUrl = settings.value("server/url", defaultServer).toString();
  if (!settings.value("setup/complete", false).toBool()) {
    FirstSetup setup(settings);
    if (setup.exec() != QDialog::Accepted) return 0;
    serverUrl = setup.serverUrl();
  }

  QMainWindow window;
  window.setWindowTitle(QStringLiteral("Panorama"));
  window.resize(1500, 940);
  auto *root = new QWidget;
  root->setObjectName("root");
  auto *layout = new QVBoxLayout(root);
  layout->setContentsMargins(0, 0, 0, 0);
  layout->setSpacing(0);
  auto *toolbar = new QWidget;
  toolbar->setObjectName("toolbar");
  auto *toolbarLayout = new QHBoxLayout(toolbar);
  toolbarLayout->setContentsMargins(16, 8, 12, 8);
  auto *brand = new QLabel(QStringLiteral("PANORAMA"));
  brand->setStyleSheet("color:#69a8ff;font-weight:700;letter-spacing:3px;");
  toolbarLayout->addWidget(brand);
  toolbarLayout->addStretch();
  auto *settingsButton = new QPushButton(QStringLiteral("Server settings"));
  toolbarLayout->addWidget(settingsButton);
  layout->addWidget(toolbar);
  auto *web = new QWebEngineView;
  web->setPage(new PanoramaPage(web));
  web->setUrl(QUrl(serverUrl));
  layout->addWidget(web, 1);
  window.setCentralWidget(root);
  QObject::connect(settingsButton, &QPushButton::clicked, &window, [&]() {
    FirstSetup setup(settings, &window);
    if (setup.exec() == QDialog::Accepted) web->setUrl(QUrl(setup.serverUrl()));
  });
  QObject::connect(web, &QWebEngineView::loadFinished, &window, [web](bool ok) {
    if (!ok) web->setHtml(QStringLiteral("<html><body style='background:#111416;color:#e6e9ec;font:15px sans-serif;padding:48px'><h2>Panorama server is unavailable</h2><p>Start your Panorama server, then use Server settings to check its address.</p></body></html>"));
  });
  window.show();
  return app.exec();
}
