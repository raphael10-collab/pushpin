import React from 'react'
import { connect } from 'react-redux'
import { Editor, getDefaultKeyBinding } from 'draft-js'
import ReactMarkdown from 'react-markdown'

import { maybeInlineFile } from './model'
import { CARD_EDITOR_CHANGED, CARD_UNIQUELY_SELECTED, CARD_TEXT_RESIZED, CARD_IMAGE_INLINED, CARD_PDF_INLINED, CARD_DELETED } from './action-types'

class InlineEditorPresentation extends React.Component {
  constructor(props) {
    super(props)
    this.state = {editorState: props.editorState}
    this.lastHeight = 0
  }

  componentDidMount() {
    this.checkFocusAndHeight()
  }

  componentDidUpdate() {
    this.checkFocusAndHeight()
  }

  checkFocusAndHeight() {
    if (this.props.selected) {
      this.focus()
    }
    const newHeight = (this.refs.editor || this.refs.renderer).clientHeight
    if (this.lastHeight != newHeight) {
      this.props.onTextResized(this.props.cardId, newHeight)
      this.lastHeight = newHeight
    }
  }

  onChange(editorState) {
    this.setState({editorState: editorState})
    this.props.onChange(this.props.cardId, editorState)
  }

  focus() {
    this.refs.editor.focus()
  }

  checkForBackspaceDelete(e) {
    if (e.key !== 'Backspace') {
      return getDefaultKeyBinding(e)
    }
    const selectionState = this.state.editorState.getSelection()
    const firstLine = (this.state.editorState.getCurrentContent().getBlockMap().first().getKey() == selectionState.getFocusKey())
    if (!firstLine) {
      return getDefaultKeyBinding(e)
    }
    const startOfLine = (selectionState.getAnchorOffset() == 0)
    if (!startOfLine) {
      return getDefaultKeyBinding(e)
    }
    return 'backspace-delete-card'
  }

  maybeDoBackspaceDelete(command) {
    if (command === 'backspace-delete-card') {
      this.props.onDeleted(this.props.cardId)
      return 'handled'
    }
    return 'not-handled'
  }

  render() {
    if (this.props.selected) {
      return (
        <div
          className={'editor'}
        >
          <Editor
            editorState={this.state.editorState}
            onChange={this.onChange.bind(this)}
            keyBindingFn={this.checkForBackspaceDelete.bind(this)}
            handleKeyCommand={this.maybeDoBackspaceDelete.bind(this)}
            ref={'editor'}
          />
        </div>
      )
    } else {
      const mdText = this.state.editorState.getCurrentContent().getPlainText('\n')
      return (
        <div
          className={'renderer'}
          ref={'renderer'}
        >
          <ReactMarkdown
            source={mdText}
          />
        </div>
      )
    }
  }
}

const mapDispatchToProps = (dispatch) => {
  return {
    onChange: (id, editorState) => {
      console.log('inlineEditor.onChange.start')
      dispatch({type: CARD_EDITOR_CHANGED, id: id, editorState: editorState })
      maybeInlineFile(dispatch, id, editorState)
      console.log('inlineEditor.onChange.finish')
    },
    onSelected: (id) => {
      console.log('inlineEditor.onSelected.start')
      dispatch({type: CARD_UNIQUELY_SELECTED, id: id})
      console.log('inlineEditor.onSelected.finish')
    },
    onDeleted: (id) => {
      console.log('inlineEditor.onDeleted.start')
      dispatch({type: CARD_DELETED, id: id})
      console.log('inlineEditor.onDeleted.finish')
    },
    onTextResized: (id, height) => {
      console.log('card.onTextResized.start')
      dispatch({type: CARD_TEXT_RESIZED, id: id, height: height})
      console.log('card.onTextResized.finish')
    },
  }
}

const InlineEditor = connect(null, mapDispatchToProps)(InlineEditorPresentation)

export default InlineEditor
