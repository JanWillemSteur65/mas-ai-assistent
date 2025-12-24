import React, { useState } from "react";
import {
  Content,
  Header,
  HeaderGlobalAction,
  HeaderGlobalBar,
  HeaderName,
  HeaderMenuButton,
  SideNav,
  SideNavItems,
  SideNavLink,
  SideNavMenu,
  SideNavMenuItem,
  Theme,
  Tag
} from "@carbon/react";
import { Routes, Route, NavLink, useLocation, BrowserRouter } from "react-router-dom";
import { Settings, Help, Chat, DataVis_1 } from "@carbon/icons-react";
import AgentPage from "./pages/AgentPage";
import SettingsPage from "./pages/SettingsPage";
import HelpPage from "./pages/HelpPage";
import TracePage from "./pages/TracePage";
import { AppProvider, useApp } from "./state/AppState";

function Shell() {
  const loc = useLocation();
  const { ui, setUi } = useApp();
  const [navExpanded, setNavExpanded] = useState(true);
  const modeLabel = ui.src === "maximo" ? "Maximo" : "AI";
  const carbonTheme = ui.theme === "dark" ? "g90" : "g10";

  return (
    <Theme theme={carbonTheme}>
      <Header aria-label="JWS Maximo AI Agent" className="jws-header">
        <HeaderMenuButton
          aria-label={navExpanded ? "Collapse side navigation" : "Expand side navigation"}
          isActive={navExpanded}
          onClick={() => setNavExpanded(!navExpanded)}
        />
        <HeaderName prefix="" href="/" element={NavLink as any}>
          JWS Maximo AI Agent
        </HeaderName>
        <HeaderGlobalBar>
          <Tag type={ui.src === "maximo" ? "red" : "blue"} title="Mode">{modeLabel}</Tag>
          <HeaderGlobalAction
            aria-label="Toggle mode"
            onClick={() => setUi({ ...ui, src: ui.src === "maximo" ? "ai" : "maximo" })}
            tooltipAlignment="end"
          >
            <Chat size={20} />
          </HeaderGlobalAction>
        </HeaderGlobalBar>
      </Header>

      <SideNav
        aria-label="Side navigation"
        expanded={navExpanded}
        isFixedNav={true}
        isRail={!navExpanded}
        className="jws-sidenav"
      >
        <SideNavItems>
          <SideNavLink element={NavLink as any} to="/" isActive={loc.pathname === "/"} renderIcon={Chat}>
            Home
          </SideNavLink>

          <SideNavMenu title="REST Builder & Trace" renderIcon={DataVis_1} defaultExpanded={true}>
            <SideNavMenuItem element={NavLink as any} to="/rest-builder">
              REST Builder
            </SideNavMenuItem>
            <SideNavMenuItem element={NavLink as any} to="/trace/request">
              Trace (v1) — Request
            </SideNavMenuItem>
            <SideNavMenuItem element={NavLink as any} to="/trace/response">
              Trace (v1) — Response
            </SideNavMenuItem>
            <SideNavMenuItem element={NavLink as any} to="/trace/logs">
              Trace (v1) — Logs
            </SideNavMenuItem>
          </SideNavMenu>

          <SideNavLink element={NavLink as any} to="/settings" renderIcon={Settings}>
            Settings
          </SideNavLink>
          <SideNavLink element={NavLink as any} to="/help" renderIcon={Help}>
            Help
          </SideNavLink>
        </SideNavItems>
      </SideNav>

      <Content>
        <div className="appContent">
          <Routes>
            <Route path="/" element={<AgentPage />} />
            <Route path="/rest-builder" element={<TracePage initialTab={0} />} />
            <Route path="/trace/request" element={<TracePage initialTab={1} />} />
            <Route path="/trace/response" element={<TracePage initialTab={2} />} />
            <Route path="/trace/logs" element={<TracePage initialTab={2} />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/help" element={<HelpPage />} />
          </Routes>
        </div>
      </Content>
    </Theme>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <Shell />
      </AppProvider>
    </BrowserRouter>
  );
}
