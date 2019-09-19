import React, { useRef, useCallback, memo, useMemo, useState } from 'react'
import Debug from 'debug'
import { ContextMenuTrigger } from 'react-contextmenu'
import { DocUrl } from 'hypermerge'

import ContentTypes from '../../../ContentTypes'
import * as ImportData from '../../../ImportData'
import { PushpinUrl } from '../../../ShareLink'
import { ContentProps } from '../../Content'
import { BoardDoc, CardId } from '.'
import BoardCard, { BoardCardAction } from './BoardCard'
import BoardContextMenu from './BoardContextMenu'
import './Board.css'
import { Position, Dimension, gridOffset, GRID_SIZE } from './BoardGrid'
import { useSelection } from './BoardSelection'
import {
  deleteCards,
  addCardForContent,
  moveCardsBy,
  cardResized,
  changeBackgroundColor,
  BoardDocManipulationAction,
} from './BoardDocManipulation'

import { BOARD_CARD_DRAG_ORIGIN, PUSHPIN_DRAG_TYPE } from '../../../constants'
import { useDocumentReducer } from '../../../Hooks'

const log = Debug('pushpin:board')

export const BOARD_COLORS = {
  DEFAULT: '#D5DFE5',
  SNOW: '#EBEDF4',
  BEIGE: '#f3f1ec',
  CANVAS: '#D8D1C0',
  SKY: '#dcf3f6',
  VIOLET: '#e5dcf6',
  PINK: '#ffe1e7',
  HERB: '#daefd2',
  PEACH: '#ffd2cc',
  RUST: '#D96767',
  ENGINEER: '#FFE283',
  KEYLIME: '#A1E991',
  PINE: '#63D2A5',
  SOFT: '#64BCDF',
  BIGBLUE: '#3A66A3',
  ROYAL: '#A485E2',
  KAWAII: '#ED77AA',
  BLACK: '#2b2b2b',
}

export const BOARD_WIDTH = 3600
export const BOARD_HEIGHT = 1800

// We don't want to compute a new array in every render.
const BOARD_COLOR_VALUES = Object.values(BOARD_COLORS)

interface DragEnd {
  type: 'DragEnd'
  distance: Position
}

export type BoardAction = BoardDocManipulationAction | BoardCardAction | DragEnd

interface CardArgs {
  position: Position
  dimension?: Dimension
}

export interface AddCardArgs extends CardArgs {
  url: PushpinUrl
}

function Board(props: ContentProps) {
  const boardRef = useRef<HTMLDivElement>(null)
  const { selection, selectOnly, selectToggle, selectNone } = useSelection<CardId>()

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // this event can be consumed by a card if it wants to keep control of backspace
      // for example, see text-content.jsx onKeyDown
      if (e.key === 'Backspace') {
        dispatch({ type: 'DeleteCards', selection })
      }
    },
    [selection]
  )

  const onClick = useCallback((e: React.MouseEvent) => {
    log('onClick')
    selectNone()
  }, [])

  const [doc, dispatch] = useDocumentReducer<BoardDoc, BoardAction>(
    props.hypermergeUrl,
    (doc, action) => {
      switch (action.type) {
        // board actions
        case 'AddCardForContent':
          addAndSelectCard(doc, action.position, action.url, action.selectOnly)
          break
        case 'ChangeBackgroundColor':
          changeBackgroundColor(doc, action.color)
          break
        case 'DeleteCards':
          deleteCards(doc, selection)
          break

        // card actions
        case 'DragEnd':
          moveCardsBy(doc, selection, action.distance)
          break
        case 'CardResized':
          cardResized(doc, action.cardId, action.dimension)
          break
        case 'CardClicked':
          onCardClicked(action.cardId, action.event)
          break
        case 'CardDoubleClicked':
          onCardDoubleClicked(doc, action.cardId, action.event)
          break
      }
    },
    [selection]
  )

  // xxx: this one is tricky because it feels like it should be in boardDocManipulation
  // but there isn't really a good way to get the cardId back from the dispatch
  function addAndSelectCard(
    doc: BoardDoc,
    position: Position,
    url: PushpinUrl,
    shouldSelect?: boolean
  ) {
    const cardId = addCardForContent(doc, { position, url })
    if (shouldSelect) {
      selectOnly(cardId)
    }
  }

  const onCardClicked = (id: CardId, e: React.MouseEvent) => {
    if (e.ctrlKey || e.shiftKey) {
      selectToggle(id)
    } else {
      // otherwise we don't have shift/ctrl, so just set selection to this
      selectOnly(id)
    }
    e.stopPropagation()
  }

  const onCardDoubleClicked = (doc: BoardDoc, id: CardId, e: React.MouseEvent) => {
    const card = doc.cards[id]
    if (card && card.url) {
      window.location.href = card.url as string
    }
    e.stopPropagation()
  }

  const onDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      log('onDoubleClick')

      // guard against a missing boardRef
      if (!boardRef.current) {
        return
      }

      const position = {
        x: e.pageX - boardRef.current.offsetLeft,
        y: e.pageY - boardRef.current.offsetTop,
      }

      ContentTypes.create('text', { text: '' }, (url) => {
        dispatch({ type: 'AddCardForContent', position, url })
      })
    },
    [boardRef, dispatch]
  )

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()

      // If we have an origin board, and it's us, this is a move operation.
      const originBoard = e.dataTransfer.getData(BOARD_CARD_DRAG_ORIGIN)
      if (originBoard === props.hypermergeUrl) {
        onDropInternal(e)
      } else {
        onDropExternal(e)
      }
    },
    [props.hypermergeUrl, selection]
  )

  const onDropInternal = (e: React.DragEvent) => {
    e.dataTransfer.dropEffect = 'move'
    // do nothing (for now)
  }

  const onDropExternal = (e: React.DragEvent) => {
    if (!boardRef.current) {
      return
    }

    // Otherwise consttruct the drop point and import the data.
    const { pageX, pageY } = e
    const dropPosition = {
      x: pageX - boardRef.current.offsetLeft,
      y: pageY - boardRef.current.offsetTop,
    }
    ImportData.importDataTransfer(e.dataTransfer, (url, i) => {
      const position = gridOffset(dropPosition, i)
      dispatch({ type: 'AddCardForContent', position, url })
    })
  }

  const onPaste = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      log('onPaste')
      e.preventDefault()
      e.stopPropagation()

      if (!e.clipboardData) {
        return
      }

      /* We can't get the mouse position on a paste event,
         so we just stick the card in the middle of the current scrolled position screen.
         (We bump it a bit to the left too to pretend we're really centering, but doing that
         would require knowledge of the card's ) */
      const position = {
        x: window.pageXOffset + window.innerWidth / 2 - GRID_SIZE * 6,
        y: window.pageYOffset + window.innerHeight / 2,
      }

      ImportData.importDataTransfer(e.clipboardData, (url, i) => {
        const offsetPosition = gridOffset(position, i)
        dispatch({ type: 'AddCardForContent', position: offsetPosition, url })
      })
    },
    [dispatch]
  )

  const docTitle = doc && doc.title ? doc.title : ''
  const contentTypes = useMemo(() => ContentTypes.list({ context: 'board' }), [])
  const { backgroundColor = '#fff' } = doc || {}

  const style = useMemo(
    () => ({
      backgroundColor,
      width: BOARD_WIDTH,
      height: BOARD_HEIGHT,
    }),
    [backgroundColor]
  )

  /**
   * at long last, render begins here
   */
  log('render')
  if (!doc) return null

  const { cards = [] } = doc || {}
  const cardChildren = Object.entries(cards)
    .filter(([id, card]) => !selection.includes(id as CardId))
    .map(([id, card]) => {
      return (
        <BoardCard
          key={id}
          id={id as CardId}
          x={card.x}
          y={card.y}
          width={card.width}
          height={card.height}
          url={card.url}
          boardUrl={props.hypermergeUrl}
          selected={false}
          uniquelySelected={false}
          dispatch={dispatch}
        />
      )
    })

  return (
    <div
      className="Board"
      ref={boardRef}
      style={style}
      onKeyDown={onKeyDown}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onDragOver={onDragOver}
      onDragEnter={onDragOver}
      onDrop={onDrop}
      onPaste={onPaste}
      role="presentation"
    >
      <BoardContextMenu
        boardTitle={docTitle}
        contentTypes={contentTypes}
        dispatch={dispatch}
        backgroundColor={backgroundColor}
        backgroundColors={BOARD_COLOR_VALUES}
      />
      <ContextMenuTrigger holdToDisplay={-1} id="BoardMenu">
        <div>{cardChildren}</div>
        <Selection
          doc={doc}
          selection={selection}
          boardUrl={props.hypermergeUrl}
          dispatch={dispatch}
        />
      </ContextMenuTrigger>
    </div>
  )
}

interface SelectionProps {
  doc: BoardDoc
  selection: CardId[]
  boardUrl: DocUrl
  dispatch: (action: BoardAction) => void
}

function Selection(props: SelectionProps) {
  const [dragStart, setDragStart] = useState<Position | null>(null)
  const selectionRef = useRef<HTMLDivElement | null>(null)

  function onDragStart(event: React.DragEvent) {
    setDragStart({ x: event.pageX, y: event.pageY })

    // when dragging on the board, we want to maintain the true card element
    event.dataTransfer.setDragImage(document.createElement('img'), 0, 0)

    // annotate the drag with the current board's URL so we can tell if this is where we came from
    event.dataTransfer.setData(BOARD_CARD_DRAG_ORIGIN, props.boardUrl)

    // we'll add the PUSHPIN_DRAG_TYPE to support dropping into non-board places
    const { url } = doc.cards[selection[0]]
    event.dataTransfer.setData(PUSHPIN_DRAG_TYPE, url)

    // and we'll add a DownloadURL
    /* if (hyperfileUrl) {
      const outputExtension = extension || mime.extension(mimeType) || ''

      const downloadUrl = `text:${title}.${outputExtension}:${hyperfileUrl}`
      event.dataTransfer.setData('DownloadURL', downloadUrl)
    } */
  }

  // we don't want to make changes to the document until the drag ends
  // but we want to move the actual DOM element during the drag so that
  // we don't have ugly ghosting
  function onDrag(e: React.DragEvent) {
    if (!dragStart) {
      return
    }

    // if you drag outside the window, you'll get an onDrag where pageX and pageY are zero.
    // this sticks the drag preview into a dumb spot, so we're just going to filter those out
    // unless anyone has a better idea.
    if (e.screenX === 0 && e.screenY === 0) {
      return
    }

    const distance = { x: e.pageX - dragStart.x, y: e.pageY - dragStart.y }

    // we want to skip expensive React recalculations, so we'll just update the style directly here
    if (!(selectionRef && selectionRef.current)) {
      return
    }
    selectionRef.current.style.setProperty('--drag-x', `${distance.x}px`)
    selectionRef.current.style.setProperty('--drag-y', `${distance.y}px`)

    e.preventDefault()
  }

  function onDragEnd(e: React.DragEvent) {
    if (!dragStart) {
      return
    }

    const distance = { x: e.pageX - dragStart.x, y: e.pageY - dragStart.y }

    dispatch({ type: 'DragEnd', distance })
    setDragStart(null)

    if (!(selectionRef && selectionRef.current)) {
      return
    }

    selectionRef.current.style.setProperty('--drag-x', '0px')
    selectionRef.current.style.setProperty('--drag-y', '0px')
  }

  const { doc, selection, boardUrl, dispatch } = props
  const { cards = [] } = doc || {}

  const cardChildren = selection.map((id) => {
    const card = cards[id]
    if (!card) {
      return null
    }

    const isSelected = true
    const uniquelySelected = selection.length === 1
    return (
      <BoardCard
        key={id}
        id={id as CardId}
        x={card.x}
        y={card.y}
        width={card.width}
        height={card.height}
        url={card.url}
        boardUrl={boardUrl}
        selected={isSelected}
        uniquelySelected={uniquelySelected}
        dispatch={dispatch}
      />
    )
  })

  return (
    <div
      className="Board--selection"
      ref={selectionRef}
      draggable
      onDragStart={onDragStart}
      onDrag={onDrag}
      onDragEnd={onDragEnd}
    >
      {cardChildren}
    </div>
  )
}

export default memo(Board)
