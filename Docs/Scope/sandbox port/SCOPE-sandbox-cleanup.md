Environment/Orchestration Structure (you would call it "the spine")

ALL NEW COMMENT CODES ARE LABEL/FUNCTION/STATE
ALL LANGUAGE RELATING TO DEATH, GRAVEYARD, ETC FOR AGENTS IS TO BE REPLACED WITH LANAUGE REGARDING RESET AND PERSISTENCE.
...when agents work in the environment or work on the environment, I don't want toxic context in the code pulling agents in wrong directions (SAVE THE REASONING FOR THE RECEIPT, AND DON'T WRITE A FUCKING NOVELLA)

1. Heirarchy: 
    - Shell: The office/factory/jobsite itself.  It has everything needed for every step below to do it's job effectively.  It provides necessary plumbing/electrical/mechanical to whatever workareas need them
        - Engines/providers
        - Global settings+context
        - Library
        - "Suite Page" is the start page where you navigate these
    - Session: This would be the work areas, a space where multiple jobs take place and the environment layout of that workspace based on the jobs that need to be done and what resources they require
        - Matrix/widgets
        - Maps+Timeline
        - Registry
        - Session settings+context
    - Track/Agent: This would be one individual entity doing the work.  Any skills/tools/gates/hooks/context that the entity would need for a particular job would be orchestrated at this level (plumber, redpen, analyst, etc)
        - Track setting+context
    - Region/Cache: This would be the equivalent to "attention span" for a worker in their workflow.  The caches are on reset: A built in suite skill is the region reset where they come back with the bare-minimum context for their particular job
        - Track settings+context
        - Job resources+materials

Phase 1: Engine
    Providers
        Keep Ollama, Gemini, and Claude
        Add provider for future?
            Figure out process for cloud models
            Wrap local models in dockers
    Settings
        Global (splash page)
        Session (session options panel)
        Widget (widget options panel)
        Track/Agent
        Region/Cache
    Context
        Global
        Session
        Track/Agent
        Region/Cache
        


Phase 2: IDE widgets
    Chat
        Keep the same, add file browser drag
        True markdown formatting
    Registry
        Queue/log 2 views, see if you can collapse call/execute      
    Editor/Terminal
        independent instances
        True markdown
        More than one terminal window
        Editor save prompts macOS browser (save model on exit)
    File browser
        show file sizes
        duplicate/rename/show in finder on right click
        open in Editor
        open in preview
    Preview = Viewer
        Shows rendered files when possible
    Gates
        Get an idea of how tools work and model capabilities
        Get rid of all the old daemon tools
    **single agent redpen run**
        - manual checklist per bullet on user functions
        - run a single agent workflow

Phase 3:
ADE
    Timeline  
        use messages and diffs to show interaction between agents (lines with notches like a subway map)
    Arrange
        Left side collapse/expand for phases
            Shows a track pane that mirrors timeline/mode to edit track/region and jump to job on the map with a map icon emoji
        Nodes are jobs (external context/last layer)
        Visualizes past work, current work, and future work
            Shows loops
        Imports mapdocs library (more in depth)
        Uses messages/changes/queue to display edges and notches 
            nodes show tracks/region info (mirror of timeline)
                shows reset count
                notes window for user input
            notches show files associated and git
            edges show shared files and messages (different wires in one cable, mirroring timeline's subway map)
    (the following are fine as is for the most part)
        Messages
        Changes
        Queue
        Ledger
        Transcripts
    **multi-agent redpen run**
    - manual checklist per bullet on user functions
    - run mult-agent workflow

Phase 4: New editions
    - script editor
    - map editor (pretty much the app)

Library
    - Phase 1: 
        - context 
        - session library
        - track+region (agent) 
    - Phase 2: registry
    - Phase 3: tool/skills/hooks
    - Phase 4: 
        - Mapdoc editor/tandem (multi-track sessions)
        - Agent editor (multi-cache agents)
        - Script engine
