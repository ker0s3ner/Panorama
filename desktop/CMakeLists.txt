cmake_minimum_required(VERSION 3.25)
project(PanoramaDesktop VERSION 0.3.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)
find_package(Qt6 6.6 REQUIRED COMPONENTS Widgets WebEngineWidgets)

qt_add_executable(panorama-desktop src/main.cpp)
target_link_libraries(panorama-desktop PRIVATE Qt6::Widgets Qt6::WebEngineWidgets)
set_target_properties(panorama-desktop PROPERTIES
  MACOSX_BUNDLE TRUE
  MACOSX_BUNDLE_GUI_IDENTIFIER "org.panorama.desktop"
  MACOSX_BUNDLE_BUNDLE_NAME "Panorama"
  WIN32_EXECUTABLE TRUE
)
install(TARGETS panorama-desktop BUNDLE DESTINATION . RUNTIME DESTINATION bin)
install(DIRECTORY "${CMAKE_BINARY_DIR}/deploy/" DESTINATION bin OPTIONAL)
if(UNIX AND NOT APPLE)
  install(FILES packaging/panorama.desktop DESTINATION share/applications)
endif()

set(CPACK_PACKAGE_NAME "Panorama")
set(CPACK_PACKAGE_VENDOR "Panorama Project")
set(CPACK_PACKAGE_VERSION ${PROJECT_VERSION})
set(CPACK_PACKAGE_DESCRIPTION_SUMMARY "Panorama desktop workspace")
set(CPACK_PACKAGE_CONTACT "https://github.com/ker0s3ner/Panorama")
if(APPLE)
  set(CPACK_GENERATOR productbuild)
  set(CPACK_PRODUCTBUILD_IDENTIFIER "org.panorama.desktop")
elseif(WIN32)
  set(CPACK_GENERATOR NSIS)
  set(CPACK_NSIS_DISPLAY_NAME "Panorama")
  set(CPACK_NSIS_ENABLE_UNINSTALL_BEFORE_INSTALL ON)
else()
  set(CPACK_GENERATOR DEB)
  set(CPACK_DEBIAN_PACKAGE_MAINTAINER "Panorama Project")
  set(CPACK_DEBIAN_PACKAGE_SECTION "science")
  set(CPACK_DEBIAN_PACKAGE_DEPENDS "libqt6webenginewidgets6, libqt6widgets6")
endif()
include(CPack)
